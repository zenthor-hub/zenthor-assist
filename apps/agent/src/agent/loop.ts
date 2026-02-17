import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { env } from "@zenthor-assist/env/agent";
import type { Tool } from "ai";

import { getConvexClient } from "../convex/client";
import { logger } from "../observability/logger";
import type { AudioTriggerMessage } from "./audio-processing";
import { buildConversationMessages, processAudioTrigger } from "./audio-processing";
import { compactMessages } from "./compact";
import { evaluateContext } from "./context-guard";
import { classifyError, isRetryable } from "./errors";
import type { AgentConfig } from "./generate";
import { generateResponse, generateResponseStreaming } from "./generate";
import {
  composeAssistantResponse,
  estimateContextTokens,
  logToolCallSummary,
} from "./generation-response";
import { createJobLeaseHandle } from "./job-lease";
import { buildLoopToolPolicy } from "./loop-policy";
import { downloadWhatsAppMedia, uploadMediaToBlob } from "./media";
import {
  discoverAndActivate,
  resolvePluginTools,
  syncBuiltinPluginDefinitions,
  syncDiagnostics,
} from "./plugins/loader";
import { wrapToolsWithApproval } from "./tool-approval";
import { filterTools } from "./tool-policy";
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

export {
  buildNoteCreationReply,
  buildNoteToolFallbackReply,
  estimateContextTokens,
  logToolCallSummary,
  parseNoteCreationFailure,
  parseNoteCreationFromToolOutput,
  resolveNoteCreationOutcomes,
  summarizeToolCalls,
  type ToolCallSummary,
  type ToolCallRecord,
} from "./generation-response";

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
      let placeholderId: Id<"messages"> | undefined;
      let leaseHandle: ReturnType<typeof createJobLeaseHandle> | undefined;
      try {
        const claimed = await client.mutation(api.agent.claimJob, {
          serviceKey,
          jobId: job._id,
          processorId: workerId,
          lockMs,
        });
        if (!claimed) continue;

        leaseHandle = createJobLeaseHandle({
          client,
          serviceKey,
          jobId: job._id,
          conversationId: job.conversationId,
          workerId,
          lockMs,
          heartbeatMs,
        });
        const checkLease = leaseHandle.checkLease;

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
        const compactedContextTokenEstimate = estimateContextTokens(compactedMessages);

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

        const { noteAwarePolicy, policyFingerprint, policyMergeSource } = buildLoopToolPolicy({
          channel,
          skills: context.skills ?? [],
          pluginPolicy: pluginTools.policy,
          agentPolicy: agentConfig?.toolPolicy,
        });

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
                if (checkLease("streaming_chunk")) return;

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
              contextTokenEstimate: compactedContextTokenEstimate,
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
          const composed = composeAssistantResponse({
            channel,
            toolCalls: response.toolCalls,
            assistantContent: response.content ?? "",
          });
          logToolCallSummary(response.toolCalls, {
            conversationId: job.conversationId,
            jobId: job._id,
            channel,
            modelUsed,
            modelTelemetry: response.modelTelemetry,
            generationMode: "streaming",
            shouldCompact,
            shouldBlock,
            toolCount: Object.keys(approvalTools).length,
            contextTokenEstimate: compactedContextTokenEstimate,
          });
          const finalContent = composed.content;

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
            contextTokenEstimate: compactedContextTokenEstimate,
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
          const composed = composeAssistantResponse({
            channel,
            toolCalls: response.toolCalls,
            assistantContent: response.content ?? "",
            modelUsed,
            preferences: context.preferences === null ? undefined : context.preferences,
          });
          logToolCallSummary(response.toolCalls, {
            conversationId: job.conversationId,
            jobId: job._id,
            channel,
            modelUsed,
            modelTelemetry: response.modelTelemetry,
            generationMode: "non_streaming",
            shouldCompact,
            shouldBlock,
            toolCount: Object.keys(approvalTools).length,
            contextTokenEstimate: compactedContextTokenEstimate,
          });
          let content = composed.content;

          if (checkLease("post_generate")) {
            continue;
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
            contextTokenEstimate: compactedContextTokenEstimate,
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
          const composed = composeAssistantResponse({
            channel,
            toolCalls: response.toolCalls,
            assistantContent: response.content ?? "",
            modelUsed,
          });
          logToolCallSummary(response.toolCalls, {
            conversationId: job.conversationId,
            jobId: job._id,
            channel,
            modelUsed,
            modelTelemetry: response.modelTelemetry,
            generationMode: "non_streaming",
            shouldCompact,
            shouldBlock,
            toolCount: Object.keys(approvalTools).length,
            contextTokenEstimate: compactedContextTokenEstimate,
          });
          internalResult = composed.content;

          if (checkLease("post_generate")) {
            continue;
          }
        }

        // Check lease before completing (avoid overwriting a requeued job)
        if (checkLease("pre_complete")) {
          if (placeholderId) {
            await client
              .mutation(api.messages.failPlaceholder, {
                serviceKey,
                messageId: placeholderId,
                errorMessage: "Processing was interrupted. Please try again.",
              })
              .catch(() => {});
          }
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
        if (leaseHandle) {
          leaseHandle.stop();
        }
      }
    }
  });
}
