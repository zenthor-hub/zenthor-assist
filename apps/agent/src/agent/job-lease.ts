import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import type { ConvexClient } from "convex/browser";

import { logger } from "../observability/logger";

interface JobLeaseConfig {
  client: ConvexClient;
  serviceKey?: string;
  jobId: Id<"agentQueue">;
  conversationId: Id<"conversations">;
  workerId: string;
  lockMs: number;
  heartbeatMs: number;
}

export interface JobLeaseHandle {
  checkLease: (phase: string) => boolean;
  stop: () => void;
}

export function createJobLeaseHandle({
  client,
  serviceKey,
  jobId,
  conversationId,
  workerId,
  lockMs,
  heartbeatMs,
}: JobLeaseConfig): JobLeaseHandle {
  let leaseLost = false;
  const heartbeatInterval = setInterval(() => {
    client
      .mutation(api.agent.heartbeatJob, {
        serviceKey,
        jobId,
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

  return {
    checkLease(phase: string): boolean {
      if (!leaseLost) return false;
      void logger.lineWarn(`[agent] Lease lost for job ${jobId} (${phase})`, {
        jobId,
        conversationId,
        phase,
      });
      void logger.warn("agent.job.lease_lost", {
        jobId,
        conversationId,
        phase,
      });
      return true;
    },
    stop() {
      clearInterval(heartbeatInterval);
    },
  };
}
