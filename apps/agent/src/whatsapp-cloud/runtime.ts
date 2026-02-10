import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { env } from "@zenthor-assist/env/agent";

import { getConvexClient } from "../convex/client";
import { logger, typedEvent } from "../observability/logger";
import { sendCloudApiMessage } from "./sender";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CLOUD_API_ACCOUNT_ID = "cloud-api";
const OUTBOUND_LOCK_MS = 120_000;

/** Shared lease state — outbound loop checks this before every send. */
let leaseLost = false;

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
      void logger.lineInfo(
        `[whatsapp-cloud] Lease acquired for account '${accountId}' by '${ownerId}'`,
      );
      typedEvent.info("whatsapp.cloud.lease.acquire.success", {
        accountId,
        ownerId,
        expiresAt: lease.expiresAt!,
      });
      return;
    }

    void logger.lineInfo(
      `[whatsapp-cloud] Lease held by '${lease.ownerId ?? "unknown"}' for account '${accountId}', retrying...`,
    );
    typedEvent.warn("whatsapp.cloud.lease.acquire.contended", {
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
  void logger.lineInfo("[whatsapp-cloud] Starting outbound delivery loop...");
  typedEvent.info("whatsapp.cloud.outbound.loop.started", { accountId, ownerId });

  while (true) {
    // Pause sending while lease is lost — avoid duplicate sends from contending workers
    if (leaseLost) {
      void logger.lineWarn(
        `[whatsapp-cloud] Outbound loop paused — lease lost for '${accountId}', attempting recovery`,
      );
      try {
        await acquireLease(accountId, ownerId);
        leaseLost = false;
        void logger.lineInfo(
          `[whatsapp-cloud] Lease recovered for account '${accountId}' by '${ownerId}'`,
        );
      } catch (error) {
        void logger.lineError(
          `[whatsapp-cloud] Lease recovery error: ${error instanceof Error ? error.message : String(error)}`,
        );
        await sleep(2_000);
      }
      continue;
    }

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
          error: "Missing recipient phone for WhatsApp Cloud API outbound message",
          retry: false,
        });
        continue;
      }

      // Re-check lease before actually sending
      if (leaseLost) {
        void logger.lineWarn(
          "[whatsapp-cloud] Lease lost after claim — skipping send to avoid duplicate",
        );
        continue;
      }

      try {
        await sendCloudApiMessage(job.to, job.payload.content);
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
        `[whatsapp-cloud] Outbound loop error: ${error instanceof Error ? error.message : String(error)}`,
      );
      typedEvent.exception("whatsapp.cloud.outbound.loop.error", error, {
        accountId,
        ownerId,
      });
      await sleep(2_000);
    }
  }
}

/**
 * Start the WhatsApp Cloud API egress runtime.
 * Acquires a lease, starts heartbeat, and runs the outbound delivery loop.
 * No ingress listener — webhook handles that via Convex httpAction.
 */
export async function startWhatsAppCloudRuntime(): Promise<void> {
  const client = getConvexClient();
  const configuredAccountId = env.WHATSAPP_CLOUD_ACCOUNT_ID;
  const accountId = CLOUD_API_ACCOUNT_ID;
  const ownerId = env.WORKER_ID ?? `worker-${crypto.randomUUID().slice(0, 8)}`;
  const heartbeatMs = Math.max(5_000, env.WHATSAPP_HEARTBEAT_MS ?? 15_000);
  leaseLost = false;

  if (configuredAccountId && configuredAccountId !== CLOUD_API_ACCOUNT_ID) {
    void logger.lineWarn(
      `[whatsapp-cloud] Ignoring WHATSAPP_CLOUD_ACCOUNT_ID='${configuredAccountId}' to match ingress account '${CLOUD_API_ACCOUNT_ID}'`,
    );
  }

  await client.mutation(api.whatsappLeases.upsertAccount, {
    serviceKey: env.AGENT_SECRET,
    accountId,
    phone: env.WHATSAPP_CLOUD_PHONE ?? accountId,
    enabled: true,
  });

  await acquireLease(accountId, ownerId);

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
          leaseLost = true;
          void logger.lineError(
            `[whatsapp-cloud] Lease heartbeat lost for account '${accountId}' (owner '${ownerId}')`,
          );
          typedEvent.error("whatsapp.cloud.lease.heartbeat.lost", {
            accountId,
            ownerId,
          });
        }
      })
      .catch((error) => {
        leaseLost = true;
        void logger.lineError(
          `[whatsapp-cloud] Lease heartbeat error: ${error instanceof Error ? error.message : String(error)}`,
        );
        typedEvent.exception("whatsapp.cloud.lease.heartbeat.error", error, {
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
      typedEvent.info("whatsapp.cloud.lease.released", { accountId, ownerId });
    } catch {}
  };

  process.once("SIGINT", () => {
    release().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    release().finally(() => process.exit(0));
  });

  void startOutboundLoop(accountId, ownerId);
}
