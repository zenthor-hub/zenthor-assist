# Agent Hardening Plan

Fixes identified during code review of the core agent and WhatsApp Cloud runtimes. Organized by priority with specific file locations and proposed changes.

## P0 — Critical (data corruption, security bypass, memory leaks)

### Fix 1: Clear heartbeat intervals on lease loss and shutdown

**Problem:** Three separate interval leaks across the codebase.

**1a. Core agent loop — heartbeat keeps firing after lease loss**

- **File:** `apps/agent/src/agent/loop.ts:94-108`
- **Current behavior:** When heartbeat detects lease loss (line 103), it sets `leaseLost = true` but the interval continues firing until the `finally` block at line 468. Multiple lost-lease jobs accumulate uncleaned intervals.
- **Fix:** Clear the interval immediately inside the heartbeat failure callback:
  ```typescript
  .then((ok) => {
    if (!ok) {
      leaseLost = true;
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    }
  })
  .catch(() => {
    leaseLost = true;
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  });
  ```

**1b. WhatsApp Cloud runtime — interval handle never stored**

- **File:** `apps/agent/src/whatsapp-cloud/runtime.ts:124`
- **Current behavior:** `setInterval(...)` return value is discarded. The interval can't be cleared on SIGINT/SIGTERM shutdown, meaning heartbeat mutations may fire after lease release.
- **Fix:** Store the interval handle and clear it in the `release()` function:
  ```typescript
  const heartbeatInterval = setInterval(() => { ... }, heartbeatMs);

  const release = async () => {
    clearInterval(heartbeatInterval);
    // ... existing lease release logic
  };
  ```

**1c. WhatsApp Baileys runtime — same issue**

- **File:** `apps/agent/src/whatsapp/runtime.ts:124`
- **Same fix as 1b.**

---

### Fix 2: Race condition in outbound message claiming

**Problem:** Two egress processors can both query the same pending message and both `db.patch` it to "processing", causing duplicate sends.

- **File:** `apps/backend/convex/delivery.ts:124-138`
- **Current behavior:** `claimNextOutbound` queries all pending messages, picks the first, and patches it. No optimistic locking — if two workers run this concurrently, both can claim the same message.
- **Fix:** Add an optimistic lock check before patching:
  ```typescript
  const next = pending.filter(...).sort(...)[0];
  if (!next) return null;

  // Re-read to check it's still pending (optimistic lock)
  const fresh = await ctx.db.get(next._id);
  if (!fresh || fresh.status !== "pending") return null;

  await ctx.db.patch(next._id, {
    status: "processing",
    processorId: args.processorId,
    lockedUntil: Date.now() + args.lockMs,
  });
  ```
  Note: Convex mutations are serialized per-document, so the re-read + patch within the same mutation is safe. The race is between two separate mutation calls — the second one will see `status: "processing"` and return null.

---

### Fix 3: Webhook accepts all payloads when secret is missing

**Problem:** If `WHATSAPP_CLOUD_APP_SECRET` is accidentally unset, the webhook silently accepts all payloads without signature verification.

- **File:** `apps/backend/convex/whatsappCloud/webhook.ts:59-62`
- **Current behavior:** Returns `new Response("OK", { status: 200 })` when secret is missing.
- **Fix:** Return a 500 error to reject all webhooks when misconfigured:
  ```typescript
  if (!appSecret) {
    console.error("[whatsapp-cloud] WHATSAPP_CLOUD_APP_SECRET not set — rejecting webhook");
    return new Response("Server configuration error", { status: 500 });
  }
  ```

---

## P1 — Important (security hardening, operational reliability)

### Fix 4: HMAC timing attack vulnerability

**Problem:** Signature verification uses `===` string comparison, which is vulnerable to timing attacks.

- **File:** `apps/backend/convex/whatsappCloud/webhook.ts:26`
- **Current behavior:** `return hex === expected;`
- **Fix:** Use constant-time comparison. Convex runs on V8, so `crypto.subtle.timingSafeEqual` is not available, but we can use a manual constant-time compare:
  ```typescript
  function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
  ```
  Then: `return constantTimeEqual(hex, expected);`

---

### Fix 5: Infinite lease acquisition loop

**Problem:** `acquireLease` loops forever with no retry limit. If the lease holder crashes without releasing, the new worker hangs indefinitely.

- **File:** `apps/agent/src/whatsapp-cloud/runtime.ts:12-44`
- **Current behavior:** `while (true)` with 3s sleep between attempts.
- **Fix:** Add a maximum retry count and timeout:
  ```typescript
  const MAX_LEASE_ATTEMPTS = 120; // 6 minutes at 3s intervals
  for (let attempt = 0; attempt < MAX_LEASE_ATTEMPTS; attempt++) {
    const lease = await client.mutation(...);
    if (lease.acquired) return;
    void logger.info("whatsapp.cloud.lease.waiting", {
      accountId, attempt, maxAttempts: MAX_LEASE_ATTEMPTS,
      currentOwner: lease.currentOwnerId,
    });
    await sleep(3_000);
  }
  throw new Error(
    `Failed to acquire lease for account '${accountId}' after ${MAX_LEASE_ATTEMPTS} attempts`
  );
  ```
  Also apply the same fix to `apps/agent/src/whatsapp/runtime.ts` if it has the same pattern.

---

### Fix 6: No rate limiting or exponential backoff on outbound sends

**Problem:** Messages are sent as fast as they're claimed. Error backoff is flat 2s instead of exponential.

- **File:** `apps/agent/src/whatsapp-cloud/runtime.ts:52-101`
- **Current behavior:** `while (true)` loop with `sleep(1_000)` only when queue is empty, `sleep(2_000)` on any error.
- **Fix:** Add per-send delay and exponential backoff on errors:
  ```typescript
  const MIN_SEND_INTERVAL_MS = 100; // ~10 msg/sec
  const MAX_BACKOFF_MS = 60_000;
  let consecutiveErrors = 0;

  while (true) {
    try {
      const job = await client.mutation(api.delivery.claimNextOutbound, ...);
      if (!job) {
        await sleep(1_000);
        continue;
      }
      await sendCloudApiMessage(job.to, job.payload.content);
      consecutiveErrors = 0;
      await sleep(MIN_SEND_INTERVAL_MS);
      // ... complete outbound
    } catch (error) {
      consecutiveErrors++;
      const backoff = Math.min(
        2_000 * Math.pow(2, consecutiveErrors - 1),
        MAX_BACKOFF_MS,
      );
      await sleep(backoff);
    }
  }
  ```
  Also apply the same pattern to `apps/agent/src/whatsapp/runtime.ts` if applicable.

---

### Fix 7: Unbounded context guard truncation loop

**Problem:** The `while` loop in the context guard has no iteration limit. Could hang the worker if `evaluateContext` is broken or a single message exceeds the context window.

- **File:** `apps/agent/src/agent/loop.ts:177-182`
- **Current behavior:** Shifts messages until `shouldBlock` is false or only 1 message remains.
- **Fix:** Add a safety counter:
  ```typescript
  const MAX_TRUNCATE = 200;
  let truncated = 0;
  while (
    conversationMessages.length > 1 &&
    evaluateContext(conversationMessages, env.AI_CONTEXT_WINDOW).shouldBlock &&
    truncated++ < MAX_TRUNCATE
  ) {
    conversationMessages.shift();
  }
  if (truncated >= MAX_TRUNCATE) {
    void logger.warn("agent.conversation.truncation_limit", {
      conversationId: job.conversationId,
      jobId: job._id,
    });
  }
  ```

---

## P2 — Robustness (UX, edge cases, defensive coding)

### Fix 8: Tool approval YES/NO only resolves first pending approval

**Problem:** When multiple tools need approval in the same conversation, a "YES" reply only resolves the first pending one. No feedback about remaining approvals.

- **File:** `apps/backend/convex/whatsappCloud/mutations.ts:84-107`
- **Current behavior:** `pendingApprovals[0]!` is resolved, others are ignored.
- **Options:**
  - **Option A (simplest):** Resolve ALL pending approvals with the same YES/NO. This matches user intent — "YES" means "go ahead with everything".
  - **Option B (explicit):** Only allow one pending approval at a time. Queue subsequent tool calls until the first is resolved.
  - **Option C (verbose):** After resolving the first, send a follow-up message listing remaining pending approvals.
- **Recommended:** Option A — batch resolve. Most intuitive for WhatsApp UX:
  ```typescript
  for (const approval of pendingApprovals) {
    await ctx.db.patch(approval._id, { status, resolvedAt: Date.now() });
  }
  ```

---

### Fix 9: Track in-flight job claims to avoid redundant work

**Problem:** The `onUpdate` subscription can fire rapidly, causing the same job to appear in multiple callbacks before `claimJob` completes.

- **File:** `apps/agent/src/agent/loop.ts:78-91`
- **Fix:** Add an in-flight set:
  ```typescript
  const inFlight = new Set<string>();

  client.onUpdate(api.agent.getPendingJobs, { serviceKey }, async (jobs) => {
    if (!jobs || jobs.length === 0) return;
    for (const job of jobs) {
      if (inFlight.has(job._id)) continue;
      inFlight.add(job._id);
      try {
        // ... existing processing
      } finally {
        inFlight.delete(job._id);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      }
    }
  });
  ```

---

### Fix 10: Unsafe array access in compaction

**Problem:** `!` assertion on array element access without bounds checking. Could crash on edge cases.

- **File:** `apps/agent/src/agent/compact.ts:54, 169`
- **Fix:** Replace `!` assertions with defensive checks:
  ```typescript
  // Line 54
  const msg = messages[i];
  if (!msg) continue;

  // Line 169
  const msgToTrim = finalRecent[trimIndex];
  if (!msgToTrim) break;
  currentTokens -= estimateTokens(msgToTrim.content) + 4;
  ```

---

### Fix 11: Approval timeout returns string instead of failing the job

**Problem:** When a tool approval times out, the result is returned as a string to the AI model instead of failing. The model may produce confusing follow-up responses.

- **File:** `apps/agent/src/agent/tool-approval.ts:146-156`
- **Options:**
  - **Option A:** Throw an error to fail the job (retryable).
  - **Option B (current):** Return a string and let the model handle it.
- **Recommended:** Option A — throw so the job fails cleanly:
  ```typescript
  if (result === "timeout") {
    void logger.warn("agent.tool.approval.timeout", { ... });
    throw new Error(`Tool '${name}' approval timed out after ${APPROVAL_TIMEOUT_MS / 1000}s`);
  }
  ```

---

### Fix 12: No conversation context structure validation

**Problem:** Context is null-checked but individual fields (`messages`, `conversation`, etc.) are not validated before access.

- **File:** `apps/agent/src/agent/loop.ts:123-130`
- **Fix:** Add field validation:
  ```typescript
  if (!context?.messages || !context?.conversation) {
    await client.mutation(api.agent.failJob, {
      serviceKey,
      jobId: job._id,
      errorReason: "invalid",
      errorMessage: "Missing required conversation context fields",
    });
    continue;
  }
  ```

---

## P3 — Completeness (cleanup, future-proofing)

### Fix 13: Missing error classification for 400/404 status codes

- **File:** `apps/agent/src/agent/errors.ts`
- **Fix:** Add cases for 400 (map to `"format"`) and 404 (map to `"invalid"` or a new `"not_found"` reason).

### Fix 14: Inbound dedup table grows unbounded

- **Table:** `inboundDedupe`
- **Fix:** Add a cleanup cron in `apps/backend/convex/crons.ts` that deletes records older than 7 days. Add a `by_createdAt` index for efficient range queries.

### Fix 15: Hard-coded `"cloud-api"` account ID

- **File:** `apps/backend/convex/whatsappCloud/mutations.ts:5`
- **Fix:** Extract to a constant or derive from webhook metadata to support future multi-account setups.

### Fix 16: Webhook timestamp discarded

- **File:** `apps/backend/convex/whatsappCloud/mutations.ts:16`
- **Fix:** Store the WhatsApp `timestamp` in the message record (new optional `externalTimestamp` field) instead of relying solely on `Date.now()`. Useful for debugging delayed processing.

---

## Execution Order

| Phase | Fixes | Effort | Files touched |
|-------|-------|--------|---------------|
| 1 | #1a, #1b, #1c | Small | `loop.ts`, `whatsapp-cloud/runtime.ts`, `whatsapp/runtime.ts` |
| 2 | #2, #3 | Small | `delivery.ts`, `whatsappCloud/webhook.ts` |
| 3 | #4, #5 | Small | `whatsappCloud/webhook.ts`, `whatsapp-cloud/runtime.ts`, `whatsapp/runtime.ts` |
| 4 | #6, #7 | Medium | `whatsapp-cloud/runtime.ts`, `whatsapp/runtime.ts`, `loop.ts` |
| 5 | #8, #9, #10, #11, #12 | Medium | `whatsappCloud/mutations.ts`, `loop.ts`, `compact.ts`, `tool-approval.ts` |
| 6 | #13, #14, #15, #16 | Small | `errors.ts`, `crons.ts`, `whatsappCloud/mutations.ts`, `schema.ts` |

Each phase is independently shippable. Phases 1-3 are the highest priority and can be done in a single session. Phases 4-5 require more testing. Phase 6 is optional cleanup.
