/**
 * Pure helper functions for agent queue reliability logic.
 * Extracted from agent.ts mutations for testability — no Convex imports.
 */

export const DEFAULT_JOB_LOCK_MS = 60_000;
export const MAX_ATTEMPTS = 3;
/** Pre-migration safety: jobs without lockedUntil stuck processing longer than this are stale */
export const LEGACY_STALE_MS = 5 * 60_000;

export interface JobLeaseInfo {
  lockedUntil?: number;
  startedAt?: number;
  _creationTime: number;
  attemptCount?: number;
}

export interface ConversationJobInfo {
  _id: string;
  status: string;
  lockedUntil?: number;
  isInternal?: boolean;
  parentJobId?: string;
}

export interface HeartbeatJobInfo {
  status: string;
  processorId?: string;
  lockedUntil?: number;
}

export interface ActiveJobGuardOptions {
  allowConcurrentInternalJobs?: boolean;
}

/**
 * Determines whether a processing job's lease has expired.
 * - If `lockedUntil` exists: stale when `now > lockedUntil`
 * - Otherwise (pre-migration): stale when elapsed time exceeds `legacyStaleMs`
 */
export function isJobStale(
  job: JobLeaseInfo,
  now: number,
  legacyStaleMs: number = LEGACY_STALE_MS,
): boolean {
  if (job.lockedUntil !== undefined) {
    return now > job.lockedUntil;
  }
  return now - (job.startedAt ?? job._creationTime) > legacyStaleMs;
}

/**
 * Decides whether a stale job should be requeued or permanently failed.
 */
export function resolveStaleAction(
  attemptCount: number | undefined,
  maxAttempts: number = MAX_ATTEMPTS,
): "requeue" | "fail" {
  return (attemptCount ?? 0) + 1 >= maxAttempts ? "fail" : "requeue";
}

/**
 * Returns true if any job (other than `excludeJobId`) is actively processing
 * with a non-expired lease for the same conversation.
 */
export function hasActiveJobForConversation(
  jobs: ConversationJobInfo[],
  excludeJobId: string,
  now: number,
  options: ActiveJobGuardOptions = {},
): boolean {
  const { allowConcurrentInternalJobs = false } = options;

  return jobs.some(
    (j) =>
      j._id !== excludeJobId &&
      j.status === "processing" &&
      !(allowConcurrentInternalJobs && j.isInternal) &&
      (j.lockedUntil ? now <= j.lockedUntil : true),
  );
}

/**
 * Validates that a heartbeat request is legitimate:
 * - Job is processing
 * - ProcessorId matches
 * - Lease hasn't expired (or no lockedUntil for legacy jobs)
 */
export function isHeartbeatValid(job: HeartbeatJobInfo, processorId: string, now: number): boolean {
  if (job.status !== "processing") return false;
  if (job.processorId !== processorId) return false;
  if (job.lockedUntil && now > job.lockedUntil) return false;
  return true;
}

/**
 * Whether a job can be retried (hasn't exceeded max attempts).
 */
export function canRetry(
  attemptCount: number | undefined,
  maxAttempts: number = MAX_ATTEMPTS,
): boolean {
  return (attemptCount ?? 0) + 1 < maxAttempts;
}
