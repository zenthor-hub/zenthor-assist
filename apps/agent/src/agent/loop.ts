import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { env } from "@zenthor-assist/env/agent";
import type { Tool } from "ai";

import { getConvexClient } from "../convex/client";
import { logger, typedEvent } from "../observability/logger";
import type { AudioTriggerMessage } from "./audio-processing";
import { buildConversationMessages, processAudioTrigger } from "./audio-processing";
import { compactMessages } from "./compact";
import { evaluateContext } from "./context-guard";
import { classifyError, isRetryable } from "./errors";
import type { AgentConfig } from "./generate";
import { generateResponse, generateResponseStreaming } from "./generate";
import { downloadWhatsAppMedia, uploadMediaToBlob } from "./media";
import { friendlyModelName } from "./model-names";
import {
  discoverAndActivate,
  resolvePluginTools,
  syncBuiltinPluginDefinitions,
  syncDiagnostics,
} from "./plugins/loader";
import { wrapToolsWithApproval } from "./tool-approval";
import { filterTools, getDefaultPolicy, mergeToolPolicies } from "./tool-policy";
import { getNoteTools } from "./tools";
import { createDelegateToSubagentTool } from "./tools/delegate-to-subagent";
import { createMemoryTools } from "./tools/memory";
import { createScheduleTask } from "./tools/schedule";
import { createTaskTools } from "./tools/tasks";

interface ConversationAudioMessage {
  _id: Id<"messages">;
  role: "user" | "assistant" | "system";
  media?: AudioTriggerMessage["media"];
}

interface ConversationMediaMessage {
  _id: Id<"messages">;
  content: string;
  role: "user" | "assistant" | "system";
  media?: {
    type: "audio" | "image" | "video" | "document";
    sourceId: string;
    mimetype: string;
    url?: string;
  };
}

interface ToolCallRecord {
  name: string;
  input: unknown;
  output?: unknown;
}

interface NoteCreationSummary {
  noteId: string;
  title: string;
  source: string;
}

interface NoteCreationFailure {
  toolName: string;
  reason: string;
}

function stripCodeFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (!fenced || !fenced[1]) return raw;
  return fenced[1]!;
}

function parseNoteCreateOutputRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

const NOTE_TOOL_NAMES = [
  "note_list",
  "note_get",
  "note_create",
  "note_update",
  "note_move",
  "note_archive",
  "note_generate_from_conversation",
  "note_transform",
  "note_apply_transform",
  "note_update_from_ai",
] as const;

const NOTE_TOOL_NAME_SET = new Set<string>(NOTE_TOOL_NAMES);

const NOTE_CREATION_TOOL_NAMES = ["note_create", "note_generate_from_conversation"] as const;
const NOTE_CREATION_TOOL_SET = new Set<string>(NOTE_CREATION_TOOL_NAMES);

/** Convert any remaining markdown syntax to WhatsApp-compatible formatting */
function sanitizeForWhatsApp(text: string): string {
  return (
    text
      // Convert **bold** → *bold* (double asterisks to single)
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      // Convert __bold__ → *bold*
      .replace(/__(.+?)__/g, "*$1*")
      // Convert markdown headers to bold lines
      .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
      // Strip image syntax ![alt](url) → alt: url (must run before link replacement)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1: $2")
      // Convert [text](url) → text (url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      // Convert horizontal rules (---, ***) to a simple line
      .replace(/^[-*_]{3,}$/gm, "───")
      // Clean up any triple+ newlines to double
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export function parseNoteCreationFromToolOutput(output: unknown): NoteCreationSummary | undefined {
  let parsed: Record<string, unknown> | undefined;

  if (typeof output === "string") {
    const cleaned = stripCodeFences(output).trim();
    const parseCandidate = (candidate: string): Record<string, unknown> | undefined => {
      const trimmed = candidate.trim();
      if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
      try {
        return JSON.parse(trimmed) as unknown as Record<string, unknown>;
      } catch {
        return undefined;
      }
    };

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    const fallbackPayload =
      firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : "";
    parsed = parseCandidate(cleaned) ?? parseCandidate(fallbackPayload);
    if (!parsed) return undefined;
  } else {
    parsed = parseNoteCreateOutputRecord(output);
  }

  if (!parsed) return undefined;
  const action = typeof parsed.action === "string" ? parsed.action : "";
  const noteId = typeof parsed.noteId === "string" ? parsed.noteId.trim() : "";
  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  if (action !== "note_created" || !noteId || !title) return undefined;

  return {
    noteId,
    title,
    source: typeof parsed.source === "string" ? parsed.source : "chat-generated",
  };
}

export function parseNoteCreationFailure(
  output: unknown,
  toolName = "note_create",
): NoteCreationFailure | undefined {
  const asRecord = parseNoteCreateOutputRecord(output);
  if (asRecord) {
    const reason =
      typeof asRecord.error === "string"
        ? asRecord.error
        : typeof asRecord.reason === "string"
          ? asRecord.reason
          : typeof asRecord.message === "string"
            ? asRecord.message
            : undefined;

    if (reason) {
      return {
        toolName,
        reason: reason.trim(),
      };
    }
  }

  if (typeof output !== "string") return undefined;
  const reasonMatch =
    output.match(
      /(?:Could not complete note action|Could not create note|Failed to create note)[:\s-]+(.+)$/i,
    ) ?? output.match(/error[:\s]+(.+)$/i);
  if (!reasonMatch) return undefined;

  return {
    toolName,
    reason: reasonMatch[1]?.trim() ?? "Unknown error",
  };
}

export function resolveNoteCreationOutcomes(toolCalls: ToolCallRecord[] | undefined) {
  if (!toolCalls || toolCalls.length === 0) {
    return { successes: [] as NoteCreationSummary[], failures: [] as NoteCreationFailure[] };
  }

  const successes: NoteCreationSummary[] = [];
  const failures: NoteCreationFailure[] = [];

  for (const toolCall of toolCalls) {
    if (!NOTE_CREATION_TOOL_SET.has(toolCall.name)) continue;
    const success = parseNoteCreationFromToolOutput(toolCall.output);
    if (success) {
      successes.push(success);
      continue;
    }
    const failure = parseNoteCreationFailure(toolCall.output, toolCall.name);
    failures.push(
      failure ?? {
        toolName: toolCall.name,
        reason: "Tool output did not confirm note creation.",
      },
    );
  }

  return { successes, failures };
}

function resolveNoteCreationSummaries(
  toolCalls: ToolCallRecord[] | undefined,
): NoteCreationSummary[] {
  if (!toolCalls || toolCalls.length === 0) return [];
  const entries: NoteCreationSummary[] = [];
  for (const toolCall of toolCalls) {
    if (!NOTE_CREATION_TOOL_SET.has(toolCall.name)) continue;
    const summary = parseNoteCreationFromToolOutput(toolCall.output);
    if (summary) entries.push(summary);
  }
  return entries;
}

interface ToolCallSummary {
  totalCalls: number;
  uniqueToolCount: number;
  noteToolCalls: number;
  toolCountByName: Record<string, number>;
  noteTools: string[];
}

function summarizeToolCalls(toolCalls: ToolCallRecord[] | undefined): ToolCallSummary {
  const calls = toolCalls ?? [];
  const toolCountByName: Record<string, number> = {};

  for (const toolCall of calls) {
    toolCountByName[toolCall.name] = (toolCountByName[toolCall.name] ?? 0) + 1;
  }

  const noteTools = calls
    .filter((toolCall) => NOTE_TOOL_NAME_SET.has(toolCall.name))
    .map((toolCall) => toolCall.name);

  return {
    totalCalls: calls.length,
    uniqueToolCount: Object.keys(toolCountByName).length,
    noteToolCalls: noteTools.length,
    toolCountByName,
    noteTools,
  };
}

function logToolCallSummary(
  toolCalls: ToolCallRecord[] | undefined,
  context: {
    conversationId: Id<"conversations">;
    jobId: Id<"agentQueue">;
    channel: "web" | "whatsapp" | "telegram";
    modelUsed?: string;
    generationMode: "streaming" | "non_streaming";
    shouldCompact: boolean;
    shouldBlock: boolean;
    toolCount: number;
    contextTokenEstimate?: number;
  },
) {
  const summary = summarizeToolCalls(toolCalls);
  const outcomes = resolveNoteCreationOutcomes(toolCalls);
  void typedEvent.info("agent.loop.tool_calls", {
    ...context,
    totalToolCalls: summary.totalCalls,
    uniqueToolCount: summary.uniqueToolCount,
    noteToolCalls: summary.noteToolCalls,
    noteTools: summary.noteTools,
    noteCreationSuccessCount: outcomes.successes.length,
    noteCreationFailureCount: outcomes.failures.length,
    noteCreationFailures: outcomes.failures,
    toolCountByName: summary.toolCountByName,
  });
}

export function buildNoteCreationReply(
  toolCalls: ToolCallRecord[] | undefined,
  channel: "web" | "whatsapp" | "telegram",
  explicitOutcomes?: { successes: NoteCreationSummary[]; failures: NoteCreationFailure[] },
): string | undefined {
  const summaryFromOutcomes = explicitOutcomes ?? {
    successes: resolveNoteCreationSummaries(toolCalls),
    failures: [],
  };
  const summaries = summaryFromOutcomes.successes;

  const hasCreateAttempt = (toolCalls ?? []).some((toolCall) =>
    NOTE_CREATION_TOOL_SET.has(toolCall.name),
  );
  if (!summaries.length && !hasCreateAttempt) {
    return undefined;
  }
  if (!summaries.length) {
    const reasons = summaryFromOutcomes.failures.map((failure) => failure.reason).join(" | ");
    const fallbackReason =
      reasons.length > 0 ? reasons : "Tool output did not confirm note creation.";
    return channel === "whatsapp"
      ? `Could not create note: ${fallbackReason}`
      : `Could not create note: ${fallbackReason}`;
  }

  if (channel === "whatsapp") {
    return `Created note${summaries.length > 1 ? "s" : ""}: ${summaries.map(({ title }) => title).join(", ")}.`;
  }

  const links = summaries.map(({ noteId, title }) => `[${title}](/notes/${noteId})`).join("\n");
  return `Created note(s):\n${links}`;
}

function buildNoteToolFallbackReply(toolCalls: ToolCallRecord[] | undefined): string | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;

  const hasNoteTransform = toolCalls.some((toolCall) => toolCall.name === "note_transform");
  const hasNoteApply = toolCalls.some(
    (toolCall) =>
      toolCall.name === "note_apply_transform" || toolCall.name === "note_update_from_ai",
  );

  if (!toolCalls.some((toolCall) => NOTE_TOOL_NAME_SET.has(toolCall.name))) {
    return undefined;
  }

  if (hasNoteApply) {
    return "I applied an AI note update. Check tool details for what changed.";
  }

  if (hasNoteTransform) {
    return "I prepared a note transformation. Open Tool call details and apply the suggestion when you’re ready.";
  }

  return "I completed a note action. Open Tool call details for the results.";
}

function buildPolicyFingerprint(policy?: { allow?: string[]; deny?: string[] }): string {
  const allow = [...(policy?.allow ?? [])].sort().join(",");
  const deny = [...(policy?.deny ?? [])].sort().join(",");
  return `allow:${allow || "<none>"}|deny:${deny || "<none>"}`;
}

function estimateContextTokens(messages: { content: string }[]): number {
  const charCount = messages.reduce((acc, message) => acc + message.content.length, 0);
  return Math.max(1, Math.ceil(charCount / 4));
}

export function startAgentLoop() {
  const client = getConvexClient();
  const workerId = env.WORKER_ID ?? `worker-${process.pid}`;
  const lockMs = env.AGENT_JOB_LOCK_MS ?? 60_000;
  const heartbeatMs = env.AGENT_JOB_HEARTBEAT_MS ?? 15_000;

  void logger.lineInfo("[agent] Starting agent loop — subscribing to pending jobs...");
  void logger.info("agent.loop.started", { workerId });

  // Activate plugins into the global registry and persist diagnostics
  const activationResults = discoverAndActivate();
  syncDiagnostics(client, activationResults).catch((error) => {
    void logger.lineWarn("[agent] Failed to sync plugin diagnostics", {
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : String(error),
    });
    void logger.exception("agent.plugins.sync.failed", error);
  });
  syncBuiltinPluginDefinitions(client).catch((error) => {
    void logger.lineWarn("[agent] Failed to sync builtin plugin definitions", {
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : String(error),
    });
    void logger.exception("agent.plugins.sync.failed", error);
  });

  const serviceKey = env.AGENT_SECRET;

  client.onUpdate(api.agent.getPendingJobs, { serviceKey }, async (jobs) => {
    if (!jobs || jobs.length === 0) return;

    for (const job of jobs) {
      const startedAt = Date.now();
      let heartbeatInterval: ReturnType<typeof setInterval> | undefined;
      let placeholderId: Id<"messages"> | undefined;
      try {
        const claimed = await client.mutation(api.agent.claimJob, {
          serviceKey,
          jobId: job._id,
          processorId: workerId,
          lockMs,
        });
        if (!claimed) continue;

        let leaseLost = false;
        const checkLease = (phase: string): boolean => {
          if (!leaseLost) return false;
          void logger.lineWarn(`[agent] Lease lost for job ${job._id} (${phase})`, {
            jobId: job._id,
            conversationId: job.conversationId,
            phase,
          });
          void logger.warn("agent.job.lease_lost", {
            jobId: job._id,
            conversationId: job.conversationId,
            phase,
          });
          return true;
        };
        heartbeatInterval = setInterval(() => {
          client
            .mutation(api.agent.heartbeatJob, {
              serviceKey,
              jobId: job._id,
              processorId: workerId,
              lockMs,
            })
            .then((ok) => {
              if (!ok) leaseLost = true;
            })
            .catch(() => {
              leaseLost = true;
            });
        }, heartbeatMs);

        void logger.lineInfo(
          `[agent] Processing job ${job._id} for conversation ${job.conversationId}`,
          {
            jobId: job._id,
            conversationId: job.conversationId,
          },
        );
        void logger.info("agent.job.claimed", {
          jobId: job._id,
          conversationId: job.conversationId,
          workerId,
        });

        const context = await client.query(api.agent.getConversationContext, {
          serviceKey,
          conversationId: job.conversationId,
          messageId: job.messageId,
        });
        if (!context) {
          await client.mutation(api.agent.failJob, { serviceKey, jobId: job._id });
          continue;
        }

        const agentConfig: AgentConfig | undefined = context.agent
          ? {
              systemPrompt: context.agent.systemPrompt,
              model: context.agent.model ?? undefined,
              fallbackModel: context.agent.fallbackModel ?? undefined,
              toolPolicy: context.agent.toolPolicy ?? undefined,
            }
          : undefined;

        // Process audio for the triggering message only (Meta media URLs expire quickly)
        const triggerMsg = (context.messages as ConversationAudioMessage[]).find(
          (m): m is ConversationAudioMessage & { media: AudioTriggerMessage["media"] } =>
            m._id === job.messageId && m.media?.type === "audio" && !m.media.transcript,
        );

        const audioResult = triggerMsg?.media
          ? await processAudioTrigger(triggerMsg, job.conversationId)
          : { transcripts: new Map<string, string>(), failed: new Set<string>() };

        // Persist transcript (and optionally blob URL) back to the message
        const triggerTranscript = triggerMsg
          ? audioResult.transcripts.get(triggerMsg._id)
          : undefined;
        if (triggerMsg && triggerTranscript) {
          await client.mutation(api.messages.updateMediaTranscript, {
            serviceKey,
            messageId: triggerMsg._id,
            transcript: triggerTranscript,
            mediaUrl: audioResult.blobUrl,
          });
        }

        const mediaTrigger = (context.messages as ConversationMediaMessage[]).find(
          (
            m,
          ): m is ConversationMediaMessage & {
            media: NonNullable<ConversationMediaMessage["media"]>;
          } =>
            (() => {
              const media = m.media;
              return (
                m._id === job.messageId &&
                media !== undefined &&
                media.type !== "audio" &&
                !!media.sourceId &&
                !media.url &&
                context.conversation.accountId === "cloud-api"
              );
            })(),
        );

        if (mediaTrigger) {
          try {
            const { buffer } = await downloadWhatsAppMedia(mediaTrigger.media.sourceId);
            const mediaUrl = await uploadMediaToBlob({
              buffer,
              conversationId: job.conversationId,
              messageId: mediaTrigger._id,
              mimetype: mediaTrigger.media.mimetype,
              category: mediaTrigger.media.type,
            });

            await client.mutation(api.messages.updateMediaTranscript, {
              serviceKey,
              messageId: mediaTrigger._id,
              transcript: mediaTrigger.content,
              mediaUrl,
            });
          } catch (error) {
            logger.warn("agent.media.upload_failed", {
              messageId: mediaTrigger._id,
              conversationId: job.conversationId,
              mediaType: mediaTrigger.media.type,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        let conversationMessages = buildConversationMessages(context.messages, audioResult);

        // Compact messages if needed
        const { messages: compactedMessages, summary } = await compactMessages(
          conversationMessages,
          env.AI_CONTEXT_WINDOW,
          job.conversationId,
        );
        conversationMessages = compactedMessages;

        if (summary) {
          await client.mutation(api.messages.addSummaryMessage, {
            serviceKey,
            conversationId: job.conversationId,
            content: summary,
            channel: context.conversation.channel,
          });
          void logger.lineInfo(`[agent] Compacted conversation ${job.conversationId}`, {
            conversationId: job.conversationId,
            jobId: job._id,
          });
          void logger.info("agent.conversation.compacted", {
            conversationId: job.conversationId,
            jobId: job._id,
          });
        }

        // Post-compaction context guard: if still over budget, truncate
        const originalMessageCount = conversationMessages.length;
        const preGuard = evaluateContext(conversationMessages, env.AI_CONTEXT_WINDOW);
        const shouldCompact = !!summary;
        let shouldBlock = preGuard.shouldBlock;
        while (shouldBlock && conversationMessages.length > 1) {
          conversationMessages.shift();
          shouldBlock = evaluateContext(conversationMessages, env.AI_CONTEXT_WINDOW).shouldBlock;
        }
        const contextMessageCount = conversationMessages.length;
        const didTruncate = contextMessageCount < originalMessageCount;

        if (didTruncate) {
          void logger.lineInfo(
            `[agent] Truncated conversation ${job.conversationId} to ${conversationMessages.length} messages (context guard)`,
            {
              conversationId: job.conversationId,
              jobId: job._id,
              messageCount: contextMessageCount,
              originalCount: originalMessageCount,
            },
          );
          void logger.warn("agent.conversation.truncated", {
            conversationId: job.conversationId,
            jobId: job._id,
            originalCount: originalMessageCount,
            truncatedCount: contextMessageCount,
          });
        }

        // Check lease before generation (expensive operation)
        if (checkLease("pre_generate")) {
          continue;
        }

        const contextDiagnosticPayload = {
          conversationId: job.conversationId,
          jobId: job._id,
          shouldCompact,
          shouldBlock,
          contextTokenEstimate: estimateContextTokens(conversationMessages),
          contextMessageCount: conversationMessages.length,
        };
        void logger.info("agent.model.pre_generation_diagnostics", contextDiagnosticPayload);

        const channel = context.conversation.channel as "web" | "whatsapp" | "telegram";

        // Enqueue typing indicator for messaging channels (processed by their outbound runtimes)
        if ((channel === "whatsapp" || channel === "telegram") && context.contact?.phone) {
          client
            .mutation(api.delivery.enqueueOutbound, {
              serviceKey,
              channel,
              accountId:
                context.conversation.accountId ??
                (channel === "telegram" ? env.TELEGRAM_ACCOUNT_ID : env.WHATSAPP_ACCOUNT_ID) ??
                "default",
              conversationId: job.conversationId,
              messageId: job.messageId,
              to: context.contact.phone,
              content: "",
              metadata: { kind: "typing_indicator" },
            })
            .catch((err) => {
              void logger.lineWarn(
                `[agent] Failed to enqueue typing indicator: ${err instanceof Error ? err.message : String(err)}`,
              );
            });
        }

        const pluginTools = await resolvePluginTools({
          client,
          channel,
          agentId: context.conversation.agentId ?? undefined,
          modelName: env.AI_MODEL,
        });
        const policyResolutionWarnings = pluginTools.policyResolution?.warnings ?? [];
        if (policyResolutionWarnings.length > 0) {
          void logger.warn("agent.plugins.policy_resolution", {
            conversationId: job.conversationId,
            jobId: job._id,
            warnings: policyResolutionWarnings,
          });
        }

        const noteTools = getNoteTools({
          conversationId: job.conversationId,
          jobId: job._id,
        });

        // Bind schedule_task to this conversation so cron can trigger follow-ups
        if (pluginTools.tools.schedule_task) {
          pluginTools.tools.schedule_task = createScheduleTask(job.conversationId);
        }

        // Bind memory tools to this conversation to prevent cross-conversation data leaks
        const scopedMemory = createMemoryTools(job.conversationId);
        if (pluginTools.tools.memory_search) {
          pluginTools.tools.memory_search = scopedMemory.memory_search;
        }
        if (pluginTools.tools.memory_store) {
          pluginTools.tools.memory_store = scopedMemory.memory_store;
        }

        // Bind task tools to this conversation's owner scope
        const scopedTasks = createTaskTools(job.conversationId);
        if (pluginTools.tools.task_create) pluginTools.tools.task_create = scopedTasks.task_create;
        if (pluginTools.tools.task_list) pluginTools.tools.task_list = scopedTasks.task_list;
        if (pluginTools.tools.task_update) pluginTools.tools.task_update = scopedTasks.task_update;
        if (pluginTools.tools.task_complete) {
          pluginTools.tools.task_complete = scopedTasks.task_complete;
        }
        if (pluginTools.tools.task_delete) pluginTools.tools.task_delete = scopedTasks.task_delete;
        if (pluginTools.tools.delegate_to_subagent) {
          pluginTools.tools.delegate_to_subagent = createDelegateToSubagentTool({
            conversationId: job.conversationId,
            parentJobId: job._id,
          });
        }

        // Build channel-aware tool policy
        const channelPolicy = getDefaultPolicy(channel);

        // Union skill allow lists (skills are additive — each declares tools it needs)
        const skillAllow = new Set<string>();
        const skillDeny = new Set<string>();
        for (const skill of context.skills) {
          const tp = skill.config?.toolPolicy;
          if (!tp) continue;
          if (tp.allow) for (const t of tp.allow) skillAllow.add(t);
          if (tp.deny) for (const t of tp.deny) skillDeny.add(t);
        }
        const unionedSkillPolicy =
          skillAllow.size > 0 || skillDeny.size > 0
            ? {
                ...(skillAllow.size > 0 ? { allow: [...skillAllow] } : {}),
                ...(skillDeny.size > 0 ? { deny: [...skillDeny] } : {}),
              }
            : undefined;

        const policies = [channelPolicy];
        if (unionedSkillPolicy) policies.push(unionedSkillPolicy);
        if (pluginTools.policy) policies.push(pluginTools.policy);
        if (agentConfig?.toolPolicy) policies.push(agentConfig.toolPolicy);
        const mergedPolicy = policies.length > 1 ? mergeToolPolicies(...policies) : channelPolicy;
        const policyMergeSource = [
          "channel",
          unionedSkillPolicy ? "skills" : undefined,
          pluginTools.policy ? "plugin" : undefined,
          agentConfig?.toolPolicy ? "agent" : undefined,
        ]
          .filter((source): source is string => source !== undefined)
          .join("+");
        const policyFingerprint = buildPolicyFingerprint(mergedPolicy);

        const noteAwarePolicy: typeof mergedPolicy = (() => {
          if (channel === "telegram") return mergedPolicy;

          const denied = new Set<string>(mergedPolicy.deny ?? []);
          const allowed = mergedPolicy.allow ? [...mergedPolicy.allow] : [];
          const addOn = NOTE_TOOL_NAMES.filter(
            (name) => !denied.has(name) && !allowed.includes(name),
          );
          if (addOn.length === 0) return mergedPolicy;

          return {
            ...mergedPolicy,
            allow: [...allowed, ...addOn],
          };
        })();

        const mergedTools = {
          ...pluginTools.tools,
          ...noteTools,
        };

        const filteredTools = filterTools(mergedTools, noteAwarePolicy) as Record<string, Tool>;

        // Wrap high-risk tools with approval flow
        const approvalTools = wrapToolsWithApproval(
          filteredTools,
          {
            jobId: job._id,
            conversationId: job.conversationId,
            channel,
            phone: context.contact?.phone,
            accountId: context.conversation.accountId ?? undefined,
          },
          {
            toolContracts: pluginTools.toolContracts,
          },
        );

        const isInternalJob = job.isInternal === true;
        const isWeb = context.conversation.channel === "web";
        let modelUsed: string | undefined;
        let internalResult: string | undefined;

        if (!isInternalJob && isWeb) {
          if (checkLease("pre_placeholder")) {
            continue;
          }

          placeholderId = await client.mutation(api.messages.createPlaceholder, {
            serviceKey,
            conversationId: job.conversationId,
            channel: "web",
          });
          if (!placeholderId) continue;
          const activeMessageId = placeholderId;

          let lastPatchTime = 0;
          const THROTTLE_MS = 200;

          const response = await generateResponseStreaming(
            compactedMessages,
            context.skills,
            {
              onChunk: (accumulatedText) => {
                if (leaseLost) return;

                const now = Date.now();
                if (now - lastPatchTime >= THROTTLE_MS) {
                  lastPatchTime = now;
                  client
                    .mutation(api.messages.updateStreamingContent, {
                      serviceKey,
                      messageId: activeMessageId,
                      content: accumulatedText,
                    })
                    .catch((err) => {
                      void logger.warn("agent.stream.update_failed", {
                        jobId: job._id,
                        error: err instanceof Error ? err.message : String(err),
                      });
                    });
                }
              },
            },
            {
              toolsOverride: approvalTools,
              agentConfig,
              channel,
              toolCount: Object.keys(approvalTools).length,
              contextMessageCount,
              contextTokenEstimate: estimateContextTokens(compactedMessages),
              shouldCompact,
              shouldBlock,
              policyFingerprint,
              policyMergeSource,
              conversationId: job.conversationId,
              jobId: job._id,
              toolContracts: pluginTools.toolContracts,
              noteContext: context.noteContext
                ? {
                    noteId: context.noteContext.noteId,
                    title: context.noteContext.title,
                    preview: context.noteContext.contentPreview,
                  }
                : undefined,
              messageCount: compactedMessages.length,
            },
          );

          modelUsed = response.modelUsed;
          const noteCreationOutcomes = resolveNoteCreationOutcomes(response.toolCalls);
          logToolCallSummary(response.toolCalls, {
            conversationId: job.conversationId,
            jobId: job._id,
            channel,
            modelUsed,
            generationMode: "streaming",
            shouldCompact,
            shouldBlock,
            toolCount: Object.keys(approvalTools).length,
            contextTokenEstimate: estimateContextTokens(compactedMessages),
          });
          const noteCreationMessage = buildNoteCreationReply(
            response.toolCalls,
            channel,
            noteCreationOutcomes,
          );
          const assistantContent = response.content ?? "";
          const toolFallback =
            assistantContent.trim() === ""
              ? buildNoteToolFallbackReply(response.toolCalls)
              : undefined;
          const finalContent = noteCreationMessage ?? toolFallback ?? assistantContent;

          if (checkLease("post_generate")) {
            await client
              .mutation(api.messages.failPlaceholder, {
                serviceKey,
                messageId: activeMessageId,
                errorMessage: "Processing was interrupted. Please try again.",
              })
              .catch(() => {});
            continue;
          }

          // Send final unthrottled update so the UI shows complete text before finalize
          await client
            .mutation(api.messages.updateStreamingContent, {
              serviceKey,
              messageId: activeMessageId,
              content: finalContent,
            })
            .catch((err) => {
              void logger.warn("agent.stream.final_update_failed", {
                jobId: job._id,
                error: err instanceof Error ? err.message : String(err),
              });
            });

          if (checkLease("pre_finalize")) {
            await client
              .mutation(api.messages.failPlaceholder, {
                serviceKey,
                messageId: activeMessageId,
                errorMessage: "Processing was interrupted. Please try again.",
              })
              .catch(() => {});
            continue;
          }

          await client.mutation(api.messages.finalizeMessage, {
            serviceKey,
            messageId: activeMessageId,
            content: finalContent,
            toolCalls: response.toolCalls,
            modelUsed,
          });
        } else if (!isInternalJob) {
          const response = await generateResponse(compactedMessages, context.skills, {
            toolsOverride: approvalTools,
            agentConfig,
            channel,
            toolCount: Object.keys(approvalTools).length,
            contextMessageCount,
            contextTokenEstimate: estimateContextTokens(compactedMessages),
            shouldCompact,
            shouldBlock,
            policyFingerprint,
            policyMergeSource,
            conversationId: job.conversationId,
            jobId: job._id,
            toolContracts: pluginTools.toolContracts,
            noteContext: context.noteContext
              ? {
                  noteId: context.noteContext.noteId,
                  title: context.noteContext.title,
                  preview: context.noteContext.contentPreview,
                }
              : undefined,
            messageCount: compactedMessages.length,
          });
          modelUsed = response.modelUsed;
          const noteCreationOutcomes = resolveNoteCreationOutcomes(response.toolCalls);
          logToolCallSummary(response.toolCalls, {
            conversationId: job.conversationId,
            jobId: job._id,
            channel,
            modelUsed,
            generationMode: "non_streaming",
            shouldCompact,
            shouldBlock,
            toolCount: Object.keys(approvalTools).length,
            contextTokenEstimate: estimateContextTokens(compactedMessages),
          });
          const noteCreationMessage = buildNoteCreationReply(
            response.toolCalls,
            channel,
            noteCreationOutcomes,
          );

          const assistantContent = response.content ?? "";
          const toolFallback =
            assistantContent.trim() === ""
              ? buildNoteToolFallbackReply(response.toolCalls)
              : undefined;

          let content = noteCreationMessage
            ? noteCreationMessage
            : channel === "whatsapp"
              ? sanitizeForWhatsApp(toolFallback ?? assistantContent)
              : (toolFallback ?? assistantContent);

          if (checkLease("post_generate")) {
            continue;
          }

          if (!noteCreationMessage && channel === "whatsapp" && context.preferences) {
            const parts: string[] = [];
            if (context.preferences.showModelInfo && modelUsed)
              parts.push(`Model: ${friendlyModelName(modelUsed)}`);
            if (context.preferences.showToolDetails && response.toolCalls?.length) {
              const counts = new Map<string, number>();
              for (const tc of response.toolCalls) {
                counts.set(tc.name, (counts.get(tc.name) ?? 0) + 1);
              }
              const summary = [...counts.entries()]
                .map(([name, count]) => (count > 1 ? `${name} x${count}` : name))
                .join(", ");
              parts.push(`Tools: ${summary}`);
            }
            if (parts.length > 0) {
              // Strip any model/tool info the LLM may have echoed from conversation history
              content = content.replace(/\n+_?Model:.*$/s, "").trimEnd();
              content += `\n\n_${parts.join(" | ")}_`;
            }
          }

          const assistantMessageId = await client.mutation(api.messages.addAssistantMessage, {
            serviceKey,
            conversationId: job.conversationId,
            content,
            channel: context.conversation.channel,
            toolCalls: response.toolCalls,
            modelUsed,
          });

          if (channel === "whatsapp" && context.contact?.phone && assistantMessageId) {
            await client.mutation(api.delivery.enqueueOutbound, {
              serviceKey,
              channel: "whatsapp",
              accountId: context.conversation.accountId ?? env.WHATSAPP_ACCOUNT_ID ?? "default",
              conversationId: job.conversationId,
              messageId: assistantMessageId,
              to: context.contact.phone,
              content,
              metadata: {
                kind: "assistant_message",
              },
            });
          }
          if (channel === "telegram" && context.contact?.phone && assistantMessageId) {
            await client.mutation(api.delivery.enqueueOutbound, {
              serviceKey,
              channel: "telegram",
              accountId: context.conversation.accountId ?? env.TELEGRAM_ACCOUNT_ID ?? "default",
              conversationId: job.conversationId,
              messageId: assistantMessageId,
              to: context.contact.phone,
              content,
              metadata: {
                kind: "assistant_message",
              },
            });
          }
        } else {
          const response = await generateResponse(compactedMessages, context.skills, {
            toolsOverride: approvalTools,
            agentConfig,
            channel,
            toolCount: Object.keys(approvalTools).length,
            contextMessageCount,
            contextTokenEstimate: estimateContextTokens(compactedMessages),
            shouldCompact,
            shouldBlock,
            policyFingerprint,
            policyMergeSource,
            conversationId: job.conversationId,
            jobId: job._id,
            toolContracts: pluginTools.toolContracts,
            noteContext: context.noteContext
              ? {
                  noteId: context.noteContext.noteId,
                  title: context.noteContext.title,
                  preview: context.noteContext.contentPreview,
                }
              : undefined,
            messageCount: compactedMessages.length,
          });
          modelUsed = response.modelUsed;
          const noteCreationOutcomes = resolveNoteCreationOutcomes(response.toolCalls);
          logToolCallSummary(response.toolCalls, {
            conversationId: job.conversationId,
            jobId: job._id,
            channel,
            modelUsed,
            generationMode: "non_streaming",
            shouldCompact,
            shouldBlock,
            toolCount: Object.keys(approvalTools).length,
            contextTokenEstimate: estimateContextTokens(compactedMessages),
          });
          const noteCreationMessage = buildNoteCreationReply(
            response.toolCalls,
            channel,
            noteCreationOutcomes,
          );
          const assistantContent = response.content ?? "";
          const toolFallback =
            assistantContent.trim() === ""
              ? buildNoteToolFallbackReply(response.toolCalls)
              : undefined;
          internalResult = noteCreationMessage ?? toolFallback ?? assistantContent;

          if (checkLease("post_generate")) {
            continue;
          }
        }

        // Check lease before completing (avoid overwriting a requeued job)
        if (checkLease("pre_complete")) {
          continue;
        }

        await client.mutation(api.agent.completeJob, {
          serviceKey,
          jobId: job._id,
          modelUsed,
          result: isInternalJob ? internalResult : undefined,
        });
        void logger.lineInfo(
          `[agent] Completed job ${job._id}${modelUsed ? ` (model: ${modelUsed})` : ""}`,
          {
            jobId: job._id,
            conversationId: job.conversationId,
            modelUsed,
            durationMs: Date.now() - startedAt,
          },
        );
        void logger.info("agent.job.completed", {
          jobId: job._id,
          conversationId: job.conversationId,
          channel,
          modelUsed,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        const reason = classifyError(error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        void logger.lineError(`[agent] Failed job ${job._id} (${reason})`, {
          jobId: job._id,
          conversationId: job.conversationId,
          reason,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack }
              : String(error),
        });
        void logger.exception("agent.job.failed", error, {
          jobId: job._id,
          conversationId: job.conversationId,
          reason,
          errorMessage,
          durationMs: Date.now() - startedAt,
        });

        // Clean up orphaned placeholder message so UI doesn't show infinite loading
        if (placeholderId) {
          await client
            .mutation(api.messages.failPlaceholder, {
              serviceKey,
              messageId: placeholderId,
              errorMessage: "Sorry, something went wrong. Please try again.",
            })
            .catch(() => {});
        }

        if (isRetryable(reason)) {
          const retried = await client
            .mutation(api.agent.retryJob, { serviceKey, jobId: job._id })
            .catch(() => false);
          if (retried) {
            void logger.lineInfo(`[agent] Retrying job ${job._id} (${reason})`, {
              jobId: job._id,
              conversationId: job.conversationId,
              reason,
            });
            void logger.warn("agent.job.retried", {
              jobId: job._id,
              conversationId: job.conversationId,
              reason,
            });
            continue;
          }
        }

        await client
          .mutation(api.agent.failJob, {
            serviceKey,
            jobId: job._id,
            errorReason: reason,
            errorMessage: errorMessage.slice(0, 500),
          })
          .catch(() => {});
      } finally {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      }
    }
  });
}
