import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { env } from "@zenthor-assist/env/agent";

import { getConvexClient } from "../convex/client";
import { logger, typedEvent } from "../observability/logger";
import { startWhatsApp } from "./connection";
import { sendWhatsAppMessage } from "./sender";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface WhatsAppRuntimeOptions {
  enableIngress: boolean;
  enableEgress: boolean;
}

const OUTBOUND_LOCK_MS = 120_000;

async function acquireLease(accountId: string, ownerId: string): Promise<void> {
  const client = getConvexClient();

  while (true) {
    const lease = await client.mutation(api.whatsappLeases.acquireLease, {
      serviceKey: env.AGENT_SECRET,
      accountId,
      ownerId,
      ttlMs: env.WHATSAPP_LEASE_TTL_MS,
    });
    if (lease.acquired) {
      void logger.lineInfo(`[whatsapp] Lease acquired for account '${accountId}' by '${ownerId}'`);
      typedEvent.info("whatsapp.lease.acquire.success", {
        accountId,
        ownerId,
        expiresAt: lease.expiresAt!,
      });
      return;
    }

    void logger.lineInfo(
      `[whatsapp] Lease held by '${lease.ownerId ?? "unknown"}' for account '${accountId}', retrying...`,
    );
    typedEvent.warn("whatsapp.lease.acquire.contended", {
      accountId,
      ownerId,
      currentOwnerId: lease.ownerId ?? "unknown",
      expiresAt: lease.expiresAt!,
    });
    await sleep(3_000);
  }
}

async function startOutboundLoop(accountId: string, ownerId: string): Promise<void> {
  const client = getConvexClient();
  void logger.lineInfo("[whatsapp] Starting outbound delivery loop...");
  typedEvent.info("whatsapp.outbound.loop.started", { accountId, ownerId });

  while (true) {
    try {
      const job = await client.mutation(api.delivery.claimNextOutbound, {
        serviceKey: env.AGENT_SECRET,
        processorId: ownerId,
        channel: "whatsapp",
        accountId,
        lockMs: OUTBOUND_LOCK_MS,
      });
      if (!job) {
        await sleep(1_000);
        continue;
      }

      if (!job.to) {
        await client.mutation(api.delivery.failOutbound, {
          serviceKey: env.AGENT_SECRET,
          id: job._id,
          error: "Missing recipient phone for WhatsApp outbound message",
          retry: false,
        });
        continue;
      }

      try {
        await sendWhatsAppMessage(job.to, job.payload.content);
        await client.mutation(api.delivery.completeOutbound, {
          serviceKey: env.AGENT_SECRET,
          id: job._id,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await client.mutation(api.delivery.failOutbound, {
          serviceKey: env.AGENT_SECRET,
          id: job._id,
          error: errorMessage,
        });
      }
    } catch (error) {
      void logger.lineError(
        `[whatsapp] Outbound loop error: ${error instanceof Error ? error.message : String(error)}`,
      );
      typedEvent.exception("whatsapp.outbound.loop.error", error, {
        accountId,
        ownerId,
      });
      await sleep(2_000);
    }
  }
}

export async function startWhatsAppRuntime(options: WhatsAppRuntimeOptions): Promise<void> {
  const client = getConvexClient();
  const accountId = env.WHATSAPP_ACCOUNT_ID ?? "default";
  const ownerId = env.WORKER_ID ?? `worker-${process.pid}`;
  const heartbeatMs = Math.max(5_000, env.WHATSAPP_HEARTBEAT_MS ?? 15_000);

  await client.mutation(api.whatsappLeases.upsertAccount, {
    serviceKey: env.AGENT_SECRET,
    accountId,
    phone: env.WHATSAPP_PHONE ?? accountId,
    enabled: true,
  });

  await acquireLease(accountId, ownerId);
  await startWhatsApp({ enableIngress: options.enableIngress });

  setInterval(() => {
    client
      .mutation(api.whatsappLeases.heartbeatLease, {
        serviceKey: env.AGENT_SECRET,
        accountId,
        ownerId,
        ttlMs: env.WHATSAPP_LEASE_TTL_MS,
      })
      .then((ok) => {
        if (!ok) {
          void logger.lineError(
            `[whatsapp] Lease heartbeat lost for account '${accountId}' (owner '${ownerId}')`,
          );
          typedEvent.error("whatsapp.lease.heartbeat.lost", {
            accountId,
            ownerId,
          });
        }
      })
      .catch((error) => {
        void logger.lineError(
          `[whatsapp] Lease heartbeat error: ${error instanceof Error ? error.message : String(error)}`,
        );
        typedEvent.exception("whatsapp.lease.heartbeat.error", error, {
          accountId,
          ownerId,
        });
      });
  }, heartbeatMs);

  const release = async () => {
    try {
      await client.mutation(api.whatsappLeases.releaseLease, {
        serviceKey: env.AGENT_SECRET,
        accountId,
        ownerId,
      });
      typedEvent.info("whatsapp.lease.released", { accountId, ownerId });
    } catch {}
  };

  process.once("SIGINT", () => {
    release().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    release().finally(() => process.exit(0));
  });

  if (options.enableEgress) {
    void startOutboundLoop(accountId, ownerId);
  }
}
