import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { env } from "@zenthor-assist/env/agent";
import type { Tool } from "ai";

import { getConvexClient } from "../convex/client";
import { logger } from "../observability/logger";
import { compactMessages } from "./compact";
import { evaluateContext } from "./context-guard";
import { classifyError, isRetryable } from "./errors";
import type { AgentConfig } from "./generate";
import { generateResponse, generateResponseStreaming } from "./generate";
import {
  discoverAndActivate,
  resolvePluginTools,
  syncBuiltinPluginDefinitions,
  syncDiagnostics,
} from "./plugins/loader";
import { wrapToolsWithApproval } from "./tool-approval";
import { filterTools, getDefaultPolicy, mergeToolPolicies } from "./tool-policy";
import { createMemoryTools } from "./tools/memory";
import { createScheduleTask } from "./tools/schedule";
import { createTodoistTools } from "./tools/todoist";

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
      try {
        const claimed = await client.mutation(api.agent.claimJob, {
          serviceKey,
          jobId: job._id,
          processorId: workerId,
          lockMs,
        });
        if (!claimed) continue;

        let leaseLost = false;
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

        let conversationMessages = context.messages
          .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
          .map((m) => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
          }));

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
        const guard = evaluateContext(conversationMessages, env.AI_CONTEXT_WINDOW);
        if (guard.shouldBlock) {
          // Trim oldest messages until within budget (keep at least the last message)
          while (
            conversationMessages.length > 1 &&
            evaluateContext(conversationMessages, env.AI_CONTEXT_WINDOW).shouldBlock
          ) {
            conversationMessages.shift();
          }
          void logger.lineInfo(
            `[agent] Truncated conversation ${job.conversationId} to ${conversationMessages.length} messages (context guard)`,
            {
              conversationId: job.conversationId,
              jobId: job._id,
              messageCount: conversationMessages.length,
            },
          );
          void logger.warn("agent.conversation.truncated", {
            conversationId: job.conversationId,
            jobId: job._id,
            messageCount: conversationMessages.length,
          });
        }

        // Check lease before generation (expensive operation)
        if (leaseLost) {
          void logger.lineWarn(`[agent] Lease lost before generation for job ${job._id}`, {
            jobId: job._id,
            conversationId: job.conversationId,
          });
          void logger.warn("agent.job.lease_lost", {
            jobId: job._id,
            conversationId: job.conversationId,
            phase: "pre_generate",
          });
          continue;
        }

        const channel = context.conversation.channel as "web" | "whatsapp";
        const pluginTools = await resolvePluginTools({
          client,
          channel,
          agentId: context.conversation.agentId ?? undefined,
          modelName: env.AI_MODEL,
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

        // Bind Todoist tools to this conversation's owner scope
        const scopedTodoist = createTodoistTools(job.conversationId);
        if (pluginTools.tools.todoist_capture_task) {
          pluginTools.tools.todoist_capture_task = scopedTodoist.todoist_capture_task;
        }
        if (pluginTools.tools.todoist_list_tasks) {
          pluginTools.tools.todoist_list_tasks = scopedTodoist.todoist_list_tasks;
        }
        if (pluginTools.tools.todoist_complete_task) {
          pluginTools.tools.todoist_complete_task = scopedTodoist.todoist_complete_task;
        }
        if (pluginTools.tools.todoist_reschedule_task) {
          pluginTools.tools.todoist_reschedule_task = scopedTodoist.todoist_reschedule_task;
        }

        // Build channel-aware tool policy
        const channelPolicy = getDefaultPolicy(channel);
        const skillPolicies = context.skills
          .filter((s) => s.config?.toolPolicy)
          .map((s) => s.config!.toolPolicy!);
        const policies = [channelPolicy, ...skillPolicies];
        if (pluginTools.policy) policies.push(pluginTools.policy);
        if (agentConfig?.toolPolicy) policies.push(agentConfig.toolPolicy);
        const mergedPolicy = policies.length > 1 ? mergeToolPolicies(...policies) : channelPolicy;

        const filteredTools = filterTools(pluginTools.tools, mergedPolicy) as Record<string, Tool>;

        // Wrap high-risk tools with approval flow
        const approvalTools = wrapToolsWithApproval(filteredTools, {
          jobId: job._id,
          conversationId: job.conversationId,
          channel,
          phone: context.contact?.phone,
          accountId: context.conversation.accountId ?? undefined,
        });

        const isWeb = context.conversation.channel === "web";
        let modelUsed: string | undefined;

        if (isWeb) {
          const placeholderId = await client.mutation(api.messages.createPlaceholder, {
            serviceKey,
            conversationId: job.conversationId,
            channel: "web",
          });
          if (!placeholderId) continue;

          let lastPatchTime = 0;
          const THROTTLE_MS = 200;

          const response = await generateResponseStreaming(
            compactedMessages,
            context.skills,
            {
              onChunk: (accumulatedText) => {
                const now = Date.now();
                if (now - lastPatchTime >= THROTTLE_MS) {
                  lastPatchTime = now;
                  client
                    .mutation(api.messages.updateStreamingContent, {
                      serviceKey,
                      messageId: placeholderId,
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
            { toolsOverride: approvalTools, agentConfig },
          );

          modelUsed = response.modelUsed;

          // Send final unthrottled update so the UI shows complete text before finalize
          await client
            .mutation(api.messages.updateStreamingContent, {
              serviceKey,
              messageId: placeholderId,
              content: response.content,
            })
            .catch((err) => {
              void logger.warn("agent.stream.final_update_failed", {
                jobId: job._id,
                error: err instanceof Error ? err.message : String(err),
              });
            });

          await client.mutation(api.messages.finalizeMessage, {
            serviceKey,
            messageId: placeholderId,
            content: response.content,
            toolCalls: response.toolCalls,
          });
        } else {
          const response = await generateResponse(compactedMessages, context.skills, {
            toolsOverride: approvalTools,
            agentConfig,
            channel,
          });
          modelUsed = response.modelUsed;

          const content =
            channel === "whatsapp" ? sanitizeForWhatsApp(response.content) : response.content;

          const assistantMessageId = await client.mutation(api.messages.addAssistantMessage, {
            serviceKey,
            conversationId: job.conversationId,
            content,
            channel: context.conversation.channel,
            toolCalls: response.toolCalls,
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
        }

        // Check lease before completing (avoid overwriting a requeued job)
        if (leaseLost) {
          void logger.lineWarn(`[agent] Lease lost before completion for job ${job._id}`, {
            jobId: job._id,
            conversationId: job.conversationId,
          });
          void logger.warn("agent.job.lease_lost", {
            jobId: job._id,
            conversationId: job.conversationId,
            phase: "pre_complete",
          });
          continue;
        }

        await client.mutation(api.agent.completeJob, { serviceKey, jobId: job._id, modelUsed });
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
