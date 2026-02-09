# Core Agent Runtime: Change Summary and AI Test Playbook

## Purpose
Provide an AI-agent-optimized summary of recent core runtime changes and a deterministic test plan.

## Scope
- `apps/agent/src/agent/*`
- `apps/agent/src/index.ts` (role-aware startup checks)
- `packages/env/src/agent.ts` (AI key requirement adjustment)

---

## Change Summary

### 1) Model-aware tool resolution during execution/fallback
- Files:
  - `apps/agent/src/agent/generate.ts`
  - `apps/agent/src/agent/ai-gateway.ts`
- Change:
  - tools are now resolved per actual `modelName` used at runtime, including fallback runs.
  - provider-native search tools (`web_search`, `google_search`) are re-bound to the active model provider.
- Why:
  - prevents provider/tool-schema mismatch when route/fallback model differs from static environment model.

### 2) Lease-loss safeguards before side effects
- File: `apps/agent/src/agent/loop.ts`
- Change:
  - centralized `checkLease(phase)` guard added.
  - lease checks now happen before:
    - web placeholder creation
    - post-generation persistence
    - finalize
    - complete job
  - streaming chunk updates skip immediately when lease is lost.
- Why:
  - reduce duplicate writes/messages when lock ownership is lost mid-processing.

### 3) Lazy AI gateway initialization for generation paths
- Files:
  - `apps/agent/src/agent/ai-gateway.ts`
  - `apps/agent/src/agent/generate.ts`
  - `apps/agent/src/agent/compact.ts`
  - `apps/agent/src/agent/tools/embed.ts`
- Change:
  - gateway instance now created lazily only when model/embedding generation is used.
  - explicit runtime error if AI key is missing at generation time.
- Why:
  - supports non-core roles that do not need model inference.

### 4) Role-aware required env validation
- Files:
  - `apps/agent/src/index.ts`
  - `packages/env/src/agent.ts`
- Change:
  - `AI_GATEWAY_API_KEY` is optional in shared env schema.
  - startup now enforces required env vars by role:
    - `core|all`: requires `AI_GATEWAY_API_KEY`
    - `whatsapp-cloud`: does not require AI key.
- Why:
  - avoid unnecessary startup failures for egress-only roles while keeping core strict.

### 5) Test drift fixed (policy suite)
- File: `apps/agent/src/agent/tool-policy.test.ts`
- Change:
  - updated assertion to match current WhatsApp allowlist behavior.
- Why:
  - restore green baseline and prevent false negatives in CI/local runs.

---

## Runtime Contract (Post-change)

### Startup
- Command: `cd apps/agent && bun run start:core`
- Required for core:
  - `CONVEX_URL`
  - `AI_GATEWAY_API_KEY`
  - `AGENT_SECRET` (recommended/required in production)

### Core processing
- Subscribes to `agent.getPendingJobs`
- Claims with lock + heartbeat
- Compacts/guards context
- Generates response with model routing + fallback
- Persists assistant output
- Completes or retries/fails job
- Lease-loss guard prevents writes after lock loss

---

## AI Execution Plan (Deterministic)

## Test 0: Preflight
- Start core with required env present.
- Pass criteria:
  - no startup crash
  - logs indicate loop started/subscribed to pending jobs

## Test 1: Basic job processing (service-driven)
- Goal: verify queue -> generation -> completion path.
- Steps:
  1. Create allowed contact (service mutation).
  2. Create/get WhatsApp conversation (`accountId: "cloud-api"`).
  3. Insert user message via `messages.sendService` (this enqueues `agentQueue`).
  4. Observe core logs and table transitions.
- Pass criteria:
  - job claimed then completed
  - assistant message exists in conversation
  - for WhatsApp channel, outbound entry is enqueued

## Test 2: Retry behavior
- Goal: verify retry path still works.
- Method:
  - induce a transient model/network failure (for example temporary invalid model endpoint or network block).
- Pass criteria:
  - log contains retry attempt event
  - job requeued (`pending`) then eventually completes or fails with bounded retries

## Test 3: Lease-loss side-effect guard (chaos test)
- Goal: validate new lease guard.
- Method (controlled):
  - run core with aggressive lock settings:
    - `AGENT_JOB_LOCK_MS=2000`
    - `AGENT_JOB_HEARTBEAT_MS=10000`
  - enqueue a prompt likely to take >2s.
- Pass criteria:
  - log shows `agent.job.lease_lost` at guard phases
  - no duplicate assistant writes from the lease-losing run

## Test 4: Model/tool compatibility under provider differences
- Goal: ensure no provider tool-schema errors.
- Method:
  - use different providers across `AI_LITE_MODEL`, `AI_MODEL`, `AI_FALLBACK_MODEL`.
  - enqueue WhatsApp and web/core workloads that may call tools.
- Pass criteria:
  - no errors like invalid tool schema / provider-specific tool mismatch
  - successful completion with `modelUsed` recorded

## Test 5: End-to-end with cloud runtime
- Run both:
  - `bun run start:core`
  - `bun run start:whatsapp-cloud`
- Send a real WhatsApp message.
- Pass criteria:
  - inbound -> pending job -> core completion -> outbound send

---

## Function Runner Payload Templates (Core Validation)

Use Convex Function Runner.  
Include `"serviceKey": "<AGENT_SECRET>"` when service key enforcement is active.

## Template: create contact
Function: `contacts:create`
```json
{
  "serviceKey": "<AGENT_SECRET>",
  "phone": "<E164_OR_WA_PHONE>",
  "name": "Core Test Contact",
  "isAllowed": true
}
```

## Template: get/create conversation
Function: `conversations:getOrCreate`
```json
{
  "serviceKey": "<AGENT_SECRET>",
  "contactId": "<CONTACT_ID>",
  "channel": "whatsapp",
  "accountId": "cloud-api"
}
```

## Template: send user message (enqueue core job)
Function: `messages:sendService`
```json
{
  "serviceKey": "<AGENT_SECRET>",
  "conversationId": "<CONVERSATION_ID>",
  "content": "Core runtime test: summarize this in one sentence.",
  "channel": "whatsapp"
}
```

---

## Expected Log Signals

### Healthy
- `[agent] Starting agent loop — subscribing to pending jobs...`
- `[agent] Processing job ...`
- `[agent] Completed job ...`

### Expected under specific tests
- `agent.job.retried` (retry scenario)
- `agent.job.lease_lost` (chaos lease-loss scenario)

### Actionable errors
- missing required env var (`AI_GATEWAY_API_KEY` for core)
- repeated `agent.job.failed` with non-retryable reasons
- repeated lease loss without eventual recovery

---

## Known Limits / Follow-ups
- Job completion/failure ownership is still status-based server-side (not processor-scoped in mutation args).  
  This playbook validates guard behavior in runtime but does not change backend contract.

