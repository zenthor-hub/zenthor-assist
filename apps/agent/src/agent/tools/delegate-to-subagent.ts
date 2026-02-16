import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { env } from "@zenthor-assist/env/agent";
import { tool } from "ai";
import { z } from "zod";

import { getConvexClient } from "../../convex/client";

interface DelegationContext {
  conversationId: Id<"conversations">;
  parentJobId: Id<"agentQueue">;
}

interface DelegationJob {
  status: "pending" | "processing" | "completed" | "failed";
  result?: string;
  errorReason?: string;
  errorMessage?: string;
  delegationDepth?: number;
}

const MIN_DEPTH = 0;
const MAX_DEPTH_FALLBACK = 3;
const DEFAULT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const delegateInputSchema = z.object({
  objective: z.string().min(12).max(2_000).describe("A clear objective for the delegated subagent"),
  context: z
    .string()
    .max(2_000)
    .optional()
    .describe("Optional context or constraints to give the subagent"),
  timeoutMs: z
    .number()
    .min(1_000)
    .max(300_000)
    .optional()
    .describe("How long to wait for the delegated job in milliseconds"),
});

function buildSystemPrompt(objective: string, context?: string): string {
  return (
    `You are a delegated subagent for the parent conversation.\n\nObjective:\n${objective}\n\n` +
    (context ? `Additional context:\n${context}\n\n` : "") +
    "Return a concise result that directly addresses the objective. Do not ask for confirmation, and avoid adding commentary unrelated to the objective."
  );
}

function resolveMaxDepth(): number {
  return env.AGENT_MAX_DELEGATION_DEPTH ?? MAX_DEPTH_FALLBACK;
}

function resolveTimeout(overrideMs?: number): number {
  const fallback = env.AGENT_SUBAGENT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(overrideMs ?? fallback, 1_000), 300_000);
}

async function getAgentDepth(jobId: Id<"agentQueue">): Promise<number | null> {
  const client = getConvexClient();
  const job = (await client.query(api.agent.getAgentJob, {
    serviceKey: env.AGENT_SECRET,
    jobId,
  })) as DelegationJob | null;

  if (!job) return null;
  return Math.max(MIN_DEPTH, job.delegationDepth ?? MIN_DEPTH);
}

async function waitForInternalJob(
  jobId: Id<"agentQueue">,
  timeoutMs: number,
): Promise<
  { kind: "completed"; result: string } | { kind: "failed"; reason: string } | { kind: "timeout" }
> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const client = getConvexClient();
    const job = (await client.query(api.agent.getAgentJob, {
      serviceKey: env.AGENT_SECRET,
      jobId,
    })) as DelegationJob | null;

    if (!job) return { kind: "failed", reason: "Subagent job disappeared while waiting." };

    if (job.status === "completed") {
      return { kind: "completed", result: job.result ?? "Subagent completed without a response." };
    }

    if (job.status === "failed") {
      return {
        kind: "failed",
        reason: job.errorMessage || job.errorReason || "Subagent failed without details.",
      };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return { kind: "timeout" };
}

const fallbackDelegateTool = tool({
  description:
    "Spawn a temporary delegated subagent to solve a focused objective. This tool should be used from a bound context.",
  inputSchema: delegateInputSchema,
  execute: async () =>
    "Internal delegation is temporarily unavailable because the runtime did not bind the tool context.",
});

export function createDelegateToSubagentTool(context: DelegationContext) {
  return tool({
    description: fallbackDelegateTool.description,
    inputSchema: delegateInputSchema,
    execute: async ({ objective, context: delegateContext, timeoutMs }) => {
      const client = getConvexClient();

      const parentDepth = await getAgentDepth(context.parentJobId);
      if (parentDepth === null) {
        return "Cannot delegate: parent job not found.";
      }

      const maxDepth = resolveMaxDepth();
      const nextDepth = parentDepth + 1;
      if (nextDepth > maxDepth) {
        return `Cannot delegate: maximum delegation depth (${maxDepth}) reached.`;
      }

      const systemMessageId = await client.mutation(api.messages.addSystemMessage, {
        serviceKey: env.AGENT_SECRET,
        conversationId: context.conversationId,
        content: buildSystemPrompt(objective, delegateContext),
      });
      if (!systemMessageId) {
        return "Cannot delegate: failed to add subagent context message.";
      }

      const internalJobId = await client.mutation(api.agent.createInternalJob, {
        serviceKey: env.AGENT_SECRET,
        parentJobId: context.parentJobId,
        conversationId: context.conversationId,
        messageId: systemMessageId,
      });
      if (!internalJobId) {
        return "Cannot delegate: failed to create a subagent queue job.";
      }

      const deadlineResult = await waitForInternalJob(
        internalJobId as Id<"agentQueue">,
        resolveTimeout(timeoutMs),
      );
      if (deadlineResult.kind === "completed") return deadlineResult.result;
      if (deadlineResult.kind === "failed") return deadlineResult.reason;
      return "Subagent timed out before returning a result.";
    },
  });
}

export const delegateToSubagent = fallbackDelegateTool;
