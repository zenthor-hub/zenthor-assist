import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { env } from "@zenthor-assist/env/agent";
import type { Tool } from "ai";

import { getConvexClient } from "../convex/client";
import { logger } from "../observability/logger";
import { getGlobalRegistry } from "./plugins/registry";

const POLL_INTERVAL_MS = 1_000;
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1_000;

interface ApprovalContext {
  jobId: string;
  conversationId: string;
  channel: "web" | "whatsapp" | "telegram";
  phone?: string;
  accountId?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApproval(
  jobId: string,
  approvalId: string,
): Promise<"approved" | "rejected" | "timeout"> {
  const client = getConvexClient();
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const pending = await client.query(api.toolApprovals.getPendingByJob, {
      serviceKey: env.AGENT_SECRET,
      jobId: jobId as Id<"agentQueue">,
    });

    const stillPending = pending.some((a) => a._id === approvalId);
    if (!stillPending) {
      const all = await client.query(api.toolApprovals.getByJob, {
        serviceKey: env.AGENT_SECRET,
        jobId: jobId as Id<"agentQueue">,
      });
      const resolved = all.find((a) => a._id === approvalId);
      if (resolved) {
        return resolved.status as "approved" | "rejected";
      }
      return "rejected";
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return "timeout";
}

export function wrapToolsWithApproval(
  tools: Record<string, Tool>,
  context: ApprovalContext,
): Record<string, Tool> {
  const wrapped: Record<string, Tool> = {};

  const highRiskTools = getGlobalRegistry().getHighRiskToolNames();

  for (const [name, t] of Object.entries(tools)) {
    if (!highRiskTools.has(name)) {
      wrapped[name] = t;
      continue;
    }

    const original = t as Tool & { execute?: (...args: unknown[]) => unknown };
    if (!original.execute) {
      wrapped[name] = t;
      continue;
    }

    const originalExecute = original.execute;

    wrapped[name] = {
      ...t,
      execute: async (args: unknown, execOptions: unknown) => {
        const client = getConvexClient();

        void logger.lineInfo(`[tool-approval] Requesting approval for tool '${name}'`);

        const approvalId = await client.mutation(api.toolApprovals.create, {
          serviceKey: env.AGENT_SECRET,
          conversationId: context.conversationId as Id<"conversations">,
          jobId: context.jobId as Id<"agentQueue">,
          toolName: name,
          toolInput: args,
          channel: context.channel,
        });
        if (!approvalId) return `Tool '${name}' approval failed (unauthorized).`;
        void logger.info("agent.tool.approval.requested", {
          approvalId,
          toolName: name,
          conversationId: context.conversationId,
          jobId: context.jobId,
          channel: context.channel,
        });

        if (context.channel === "whatsapp" && context.phone) {
          const prompt = `🔐 I'd like to use the tool '${name}'. Reply YES to approve or NO to reject.`;
          const messageId = await client.mutation(api.messages.addAssistantMessage, {
            serviceKey: env.AGENT_SECRET,
            conversationId: context.conversationId as Id<"conversations">,
            content: prompt,
            channel: "whatsapp",
          });
          if (messageId) {
            await client.mutation(api.delivery.enqueueOutbound, {
              serviceKey: env.AGENT_SECRET,
              channel: "whatsapp",
              accountId: context.accountId ?? env.WHATSAPP_ACCOUNT_ID ?? "default",
              conversationId: context.conversationId as Id<"conversations">,
              messageId,
              to: context.phone,
              content: prompt,
              metadata: {
                kind: "tool_approval_request",
                toolName: name,
              },
            });
          }
        }

        void logger.lineInfo(
          `[tool-approval] Waiting for approval on tool '${name}' (id: ${approvalId})`,
        );

        const result = await waitForApproval(context.jobId, approvalId as string);

        if (result === "approved") {
          void logger.lineInfo(`[tool-approval] Tool '${name}' approved, executing`);
          void logger.info("agent.tool.approval.approved", {
            approvalId,
            toolName: name,
            conversationId: context.conversationId,
            jobId: context.jobId,
            channel: context.channel,
          });
          return (originalExecute as Function).call(null, args, execOptions);
        }

        if (result === "timeout") {
          void logger.lineInfo(`[tool-approval] Tool '${name}' approval timed out`);
          void logger.warn("agent.tool.approval.timeout", {
            approvalId,
            toolName: name,
            conversationId: context.conversationId,
            jobId: context.jobId,
            channel: context.channel,
          });
          return `Tool '${name}' approval timed out.`;
        }

        void logger.lineInfo(`[tool-approval] Tool '${name}' was rejected`);
        void logger.warn("agent.tool.approval.rejected", {
          approvalId,
          toolName: name,
          conversationId: context.conversationId,
          jobId: context.jobId,
          channel: context.channel,
        });
        return `Tool '${name}' was rejected by the user.`;
      },
    } as Tool;
  }

  return wrapped;
}
