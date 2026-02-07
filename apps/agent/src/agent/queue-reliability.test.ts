import {
  canRetry,
  DEFAULT_JOB_LOCK_MS,
  hasActiveJobForConversation,
  isHeartbeatValid,
  isJobStale,
  LEGACY_STALE_MS,
  MAX_ATTEMPTS,
  resolveStaleAction,
} from "@zenthor-assist/backend/convex/agent_queue_helpers";
import { describe, expect, it } from "vitest";

describe("isJobStale", () => {
  const baseJob = { _creationTime: 1000 };

  it("returns false when lockedUntil is in the future", () => {
    const job = { ...baseJob, lockedUntil: 5000 };
    expect(isJobStale(job, 3000)).toBe(false);
  });

  it("returns true when lockedUntil is in the past", () => {
    const job = { ...baseJob, lockedUntil: 3000 };
    expect(isJobStale(job, 5000)).toBe(true);
  });

  it("returns false when lockedUntil equals now (boundary: now > lockedUntil)", () => {
    const job = { ...baseJob, lockedUntil: 3000 };
    expect(isJobStale(job, 3000)).toBe(false);
  });

  it("returns false for legacy job within stale window", () => {
    const now = 1000 + LEGACY_STALE_MS - 1;
    expect(isJobStale(baseJob, now)).toBe(false);
  });

  it("returns true for legacy job past stale window", () => {
    const now = 1000 + LEGACY_STALE_MS + 1;
    expect(isJobStale(baseJob, now)).toBe(true);
  });

  it("uses _creationTime when startedAt is absent", () => {
    const job = { _creationTime: 2000 };
    const now = 2000 + LEGACY_STALE_MS + 1;
    expect(isJobStale(job, now)).toBe(true);
  });

  it("uses startedAt over _creationTime when present", () => {
    const job = { _creationTime: 1000, startedAt: 5000 };
    // now is past _creationTime stale window but not past startedAt stale window
    const now = 5000 + LEGACY_STALE_MS - 1;
    expect(isJobStale(job, now)).toBe(false);
  });
});

describe("resolveStaleAction", () => {
  it("requeues when attemptCount=0 and maxAttempts=3", () => {
    expect(resolveStaleAction(0, 3)).toBe("requeue");
  });

  it("requeues when attemptCount=1 and maxAttempts=3", () => {
    expect(resolveStaleAction(1, 3)).toBe("requeue");
  });

  it("fails at boundary: attemptCount=2, maxAttempts=3 (2+1 >= 3)", () => {
    expect(resolveStaleAction(2, 3)).toBe("fail");
  });

  it("treats undefined attemptCount as 0 → requeue", () => {
    expect(resolveStaleAction(undefined, 3)).toBe("requeue");
  });
});

describe("hasActiveJobForConversation", () => {
  const now = 10_000;

  it("returns false for empty jobs array", () => {
    expect(hasActiveJobForConversation([], "job-1", now)).toBe(false);
  });

  it("returns false when only the excluded job is processing", () => {
    const jobs = [{ _id: "job-1", status: "processing", lockedUntil: now + 5000 }];
    expect(hasActiveJobForConversation(jobs, "job-1", now)).toBe(false);
  });

  it("returns true when another job is processing with valid lease", () => {
    const jobs = [
      { _id: "job-1", status: "pending" },
      { _id: "job-2", status: "processing", lockedUntil: now + 5000 },
    ];
    expect(hasActiveJobForConversation(jobs, "job-1", now)).toBe(true);
  });

  it("returns false when another job is processing with expired lease", () => {
    const jobs = [
      { _id: "job-1", status: "pending" },
      { _id: "job-2", status: "processing", lockedUntil: now - 1 },
    ];
    expect(hasActiveJobForConversation(jobs, "job-1", now)).toBe(false);
  });

  it("returns false when other jobs are in non-processing status", () => {
    const jobs = [
      { _id: "job-1", status: "pending" },
      { _id: "job-2", status: "completed" },
      { _id: "job-3", status: "failed" },
      { _id: "job-4", status: "pending" },
    ];
    expect(hasActiveJobForConversation(jobs, "job-1", now)).toBe(false);
  });
});

describe("isHeartbeatValid", () => {
  it("returns true when processing, correct processorId, lease not expired", () => {
    const job = { status: "processing", processorId: "p1", lockedUntil: 10_000 };
    expect(isHeartbeatValid(job, "p1", 5000)).toBe(true);
  });

  it("returns false for wrong status", () => {
    for (const status of ["pending", "completed", "failed"]) {
      const job = { status, processorId: "p1", lockedUntil: 10_000 };
      expect(isHeartbeatValid(job, "p1", 5000)).toBe(false);
    }
  });

  it("returns false for wrong processorId", () => {
    const job = { status: "processing", processorId: "p1", lockedUntil: 10_000 };
    expect(isHeartbeatValid(job, "p2", 5000)).toBe(false);
  });

  it("returns false when lease has expired", () => {
    const job = { status: "processing", processorId: "p1", lockedUntil: 3000 };
    expect(isHeartbeatValid(job, "p1", 5000)).toBe(false);
  });

  it("returns true for legacy job without lockedUntil", () => {
    const job = { status: "processing", processorId: "p1" };
    expect(isHeartbeatValid(job, "p1", 5000)).toBe(true);
  });
});

describe("canRetry", () => {
  it("returns true when attemptCount=0", () => {
    expect(canRetry(0, MAX_ATTEMPTS)).toBe(true);
  });

  it("returns false at boundary: attemptCount=2, maxAttempts=3 (2+1 not < 3)", () => {
    expect(canRetry(2, 3)).toBe(false);
  });

  it("treats undefined attemptCount as 0 → true", () => {
    expect(canRetry(undefined, MAX_ATTEMPTS)).toBe(true);
  });
});

/**
 * Inbound dedupe contract tests.
 *
 * The actual `checkAndRegister` mutation runs in Convex, so we simulate
 * the same semantics here: atomic check-then-insert keyed by
 * (channel, channelMessageId). This verifies the behavioral contract
 * that consumers (e.g. handler.ts) depend on.
 */
describe("inbound dedupe (contract)", () => {
  /** Simulates the checkAndRegister Convex mutation contract. */
  function createDedupeStore() {
    const seen = new Map<
      string,
      { channel: string; channelMessageId: string; createdAt: number }
    >();
    return {
      checkAndRegister(channel: string, channelMessageId: string): { isDuplicate: boolean } {
        const key = `${channel}:${channelMessageId}`;
        if (seen.has(key)) return { isDuplicate: true };
        seen.set(key, { channel, channelMessageId, createdAt: Date.now() });
        return { isDuplicate: false };
      },
      size: () => seen.size,
    };
  }

  it("first message is accepted (isDuplicate: false)", () => {
    const store = createDedupeStore();
    const result = store.checkAndRegister("whatsapp", "msg-001");
    expect(result.isDuplicate).toBe(false);
  });

  it("same message is rejected on second call (isDuplicate: true)", () => {
    const store = createDedupeStore();
    store.checkAndRegister("whatsapp", "msg-001");
    const result = store.checkAndRegister("whatsapp", "msg-001");
    expect(result.isDuplicate).toBe(true);
  });

  it("different messageIds are independent", () => {
    const store = createDedupeStore();
    store.checkAndRegister("whatsapp", "msg-001");
    const result = store.checkAndRegister("whatsapp", "msg-002");
    expect(result.isDuplicate).toBe(false);
  });

  it("same messageId on different channels are independent", () => {
    const store = createDedupeStore();
    store.checkAndRegister("whatsapp", "msg-001");
    const result = store.checkAndRegister("web", "msg-001");
    expect(result.isDuplicate).toBe(false);
  });

  it("third+ calls for same key remain duplicate", () => {
    const store = createDedupeStore();
    store.checkAndRegister("whatsapp", "msg-001");
    store.checkAndRegister("whatsapp", "msg-001");
    const result = store.checkAndRegister("whatsapp", "msg-001");
    expect(result.isDuplicate).toBe(true);
  });

  it("store grows only for unique entries", () => {
    const store = createDedupeStore();
    store.checkAndRegister("whatsapp", "msg-001");
    store.checkAndRegister("whatsapp", "msg-001");
    store.checkAndRegister("whatsapp", "msg-002");
    store.checkAndRegister("web", "msg-001");
    expect(store.size()).toBe(3);
  });
});

describe("constants", () => {
  it("DEFAULT_JOB_LOCK_MS is 60 seconds", () => {
    expect(DEFAULT_JOB_LOCK_MS).toBe(60_000);
  });

  it("MAX_ATTEMPTS is 3", () => {
    expect(MAX_ATTEMPTS).toBe(3);
  });

  it("LEGACY_STALE_MS is 5 minutes", () => {
    expect(LEGACY_STALE_MS).toBe(5 * 60_000);
  });
});
