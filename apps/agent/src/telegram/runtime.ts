import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { env } from "@zenthor-assist/env/agent";

import { getConvexClient } from "../convex/client";
import { logger, typedEvent } from "../observability/logger";
import { deleteMessage, editMessage, sendMessage, sendTypingIndicator } from "./sender";

type OutboundMetadata = {
  kind?: string;
  toolName?: string;
};

type TelegramOutboundKind =
  | "assistant_message"
  | "tool_approval_request"
  | "typing_indicator"
  | "assistant_message_chunk";

const OUTBOUND_LOCK_MS = 120_000;

type Job = {
  _id: Id<"outboundMessages">;
  to?: string;
  payload: {
    content: string;
    metadata?: OutboundMetadata | null;
  };
};

function asKind(kind: string | undefined): TelegramOutboundKind | "unknown" {
  if (
    kind === "assistant_message" ||
    kind === "tool_approval_request" ||
    kind === "typing_indicator" ||
    kind === "assistant_message_chunk"
  ) {
    return kind;
  }
  return "unknown";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startOutboundLoop(accountId: string, ownerId: string): Promise<void> {
  const client = getConvexClient();
  const draftState = new Map<string, { messageId: number }>();

  void logger.lineInfo("[telegram] Starting outbound delivery loop...");
  typedEvent.info("telegram.outbound.loop.started", { accountId, ownerId });

  while (true) {
    try {
      const job = (await client.mutation(api.delivery.claimNextOutbound, {
        serviceKey: env.AGENT_SECRET,
        processorId: ownerId,
        channel: "telegram",
        accountId,
        lockMs: OUTBOUND_LOCK_MS,
      })) as Job | null;
      if (!job) {
        await sleep(1_000);
        continue;
      }

      if (!job.to) {
        await client.mutation(api.delivery.failOutbound, {
          serviceKey: env.AGENT_SECRET,
          id: job._id,
          error: "Missing recipient for Telegram outbound message",
          retry: false,
        });
        continue;
      }

      const metadata = job.payload.metadata ?? {};
      const kind = asKind(metadata.kind);
      const content = job.payload.content ?? "";

      try {
        if (kind === "assistant_message" || kind === "tool_approval_request") {
          const messageId = await sendMessage(job.to, content);
          draftState.delete(job.to);
          if (typeof messageId === "number") {
            draftState.set(`${job.to}:${job._id}`, { messageId });
          }
        } else if (kind === "assistant_message_chunk") {
          const draftKey = `${job.to}:${metadata.toolName ?? "stream"}`;
          const existing = draftState.get(draftKey);
          if (content.length > 4096) {
            if (existing) {
              await deleteMessage(job.to, existing.messageId).catch(() => {});
              draftState.delete(draftKey);
            }
          } else if (existing) {
            await editMessage(job.to, existing.messageId, content);
          } else {
            const messageId = await sendMessage(job.to, content);
            draftState.set(draftKey, { messageId });
          }
        } else if (kind === "typing_indicator") {
          await sendTypingIndicator(job.to);
        } else {
          await sendMessage(job.to, content);
          draftState.delete(job.to);
        }

        await client.mutation(api.delivery.completeOutbound, {
          serviceKey: env.AGENT_SECRET,
          id: job._id,
        });
      } catch (error) {
        await client.mutation(api.delivery.failOutbound, {
          serviceKey: env.AGENT_SECRET,
          id: job._id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      void logger.lineError(
        `[telegram] Outbound loop error: ${error instanceof Error ? error.message : String(error)}`,
      );
      typedEvent.exception("telegram.outbound.loop.error", error, {
        accountId,
        ownerId,
      });
      await sleep(2_000);
    }
  }
}

export async function startTelegramRuntime(): Promise<void> {
  const accountId = env.TELEGRAM_ACCOUNT_ID ?? "default";
  const ownerId = env.WORKER_ID ?? `worker-${crypto.randomUUID().slice(0, 8)}`;
  void logger.lineInfo(
    `[telegram] Starting Telegram runtime for account '${accountId}' as '${ownerId}'`,
  );

  void startOutboundLoop(accountId, ownerId);
}
