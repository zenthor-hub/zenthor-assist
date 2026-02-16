# Incident Playbooks

Quick remediation steps for common runtime incidents. Each section includes:

- **Symptoms**: How you detect the incident (logs, Axiom queries, Convex dashboard).
- **Root cause**: Why this happens.
- **Remediation**: Step-by-step fix.
- **Verification**: How to confirm the fix worked.
- **Rollback**: What to do if remediation fails.

Related docs:

- `docs/ops/runbook.md` (smoke tests and startup guide)
- `docs/ops/runtime-topology.md` (deployment shape and role guidance)

---

## 1. Stuck Jobs (agentQueue in "processing" indefinitely)

### Symptoms

- Messages not receiving responses for extended time.
- Convex dashboard shows `agentQueue` entries with `status: "processing"` and stale `startedAt`.
- Axiom: `agent.job.claimed` events with no matching `agent.job.completed` or `agent.job.failed`.

```bash
# Check for stuck jobs
bunx convex run agent.getPendingJobs
```

### Root Cause

Worker crashed or restarted while processing a job. The job was claimed (`processing`) but never completed or failed. If `lockedUntil` has expired and no requeue mechanism ran, the job stays stuck.

### Remediation

**Option A: Wait for stale requeue** (if ZTA-3 is deployed)

The `requeueStaleJobs` mutation automatically reclaims jobs with expired `lockedUntil`. Verify it's running:

```bash
# Check if there are jobs past their lock expiry
bunx convex run agent.getPendingJobs
```

If jobs have `lockedUntil` in the past and `status: "processing"`, the requeue cron should pick them up. Wait 1-2 minutes.

**Option B: Manual requeue**

```bash
# Reset a specific job back to pending
bunx convex run agent.retryJob '{"jobId": "<job-id>"}'
```

**Option C: Mark as failed** (if the job should not be retried)

```bash
# Fail the job with a reason
bunx convex run agent.failJob '{"jobId": "<job-id>", "errorReason": "manual_fail", "errorMessage": "Manually failed - stuck job"}'
```

### Verification

- Job returns to `pending` (Option A/B) or moves to `failed` (Option C).
- A worker claims and processes it, producing `agent.job.completed`.

### Rollback

No rollback needed. If the job produces a bad response, the message content in `messages` table is the record of truth.

---

## 2. Lease Contention (WhatsApp worker cannot acquire lease)

### Symptoms

- WhatsApp worker logs: `[whatsapp] Lease held by '<other-owner>' for account '<id>', retrying...`
- Axiom event: `whatsapp.lease.acquire.contended` with `currentOwnerId` field.
- The second worker never connects to WhatsApp.

### Root Cause

Another worker instance already holds the lease for the same `WHATSAPP_ACCOUNT_ID`. This is **expected behavior** when running multiple WhatsApp workers for the same account. Only one should be active at a time.

### Decision Tree

1. **Is the other worker alive and healthy?** Check its logs or process status.
   - Yes: This is expected. The contending worker is a standby. No action needed.
   - No: The lease is stale. Proceed to remediation.

2. **Is this a deploy/rollover situation?** (New worker replacing old one)
   - The old worker should release its lease on SIGTERM. If it didn't, the lease will expire after TTL (`WHATSAPP_LEASE_TTL_MS`, default 60s).
   - Wait for TTL expiry and the new worker will acquire.

### Remediation (stale lease from crashed worker)

```bash
# Check current lease status
bunx convex run whatsappLeases.getLease '{"accountId":"default"}'

# If the owner is dead, force-release the lease
bunx convex run whatsappLeases.forceRelease '{"accountId":"default"}'
```

If `forceRelease` doesn't exist yet, wait for the lease TTL to expire (check `expiresAt` field).

### Verification

- New worker logs: `[whatsapp] Lease acquired for account 'default' by '<new-owner>'`
- Axiom event: `whatsapp.lease.acquire.success`

### Rollback

Lease release is safe. If the wrong worker acquired the lease, restart the correct one and wait for contention/TTL cycle.

---

## 3. Heartbeat Loss (WhatsApp lease drops during operation)

### Symptoms

- Worker logs: `[whatsapp] Lease heartbeat lost for account '<id>' (owner '<owner>')`
- Axiom event: `whatsapp.lease.heartbeat.lost`
- WhatsApp messages stop being sent even though the worker process is running.

### Root Cause

1. **Network partition**: Worker cannot reach Convex to renew heartbeat.
2. **Convex latency spike**: Heartbeat mutation timed out.
3. **Another worker stole the lease**: A different worker's `acquireLease` succeeded during the heartbeat gap.

### Remediation

1. **Check worker connectivity**: Can the worker reach Convex?

   ```bash
   # From the worker host
   curl -s https://<deployment>.convex.cloud/version | head -1
   ```

2. **Check current lease owner**:

   ```bash
   bunx convex run whatsappLeases.getLease '{"accountId":"default"}'
   ```

3. **If the worker is healthy but lost the lease**: Restart the worker. It will enter the acquisition loop and either get the lease back or wait for the current holder.

4. **If the worker is unhealthy**: Fix the underlying issue (network, host, etc.) then restart.

### Verification

- After restart, worker logs `[whatsapp] Lease acquired` and `[whatsapp] Connected successfully`.
- Outbound delivery resumes.

### Rollback

If restarting causes a new issue, stop the worker and verify the other lease holder (if any) is healthy. One healthy worker is enough.

---

## 4. WhatsApp Auth Corruption (Baileys session invalid)

### Symptoms

- Worker logs: Baileys errors on connection (e.g., `Bad MAC`, `Stream Errored`, repeated QR code prompts).
- Axiom events: `whatsapp.baileys.error` with auth-related messages.
- Worker connects but immediately gets `loggedOut` disconnect reason.

### Root Cause

1. **Session revoked**: The linked device was removed from WhatsApp settings on the phone.
2. **Corrupt local auth state**: `.whatsapp-auth/` directory has invalid or partial data.
3. **Corrupt Convex auth state**: `whatsappSession` table has invalid entries (when using `WHATSAPP_AUTH_MODE=convex`).

### Remediation

**For local auth mode** (`WHATSAPP_AUTH_MODE=local`):

```bash
# Stop the worker
# Delete the auth directory
rm -rf apps/agent/.whatsapp-auth/

# Restart the worker - it will show a new QR code
AGENT_ROLE=whatsapp bun run start
```

Scan the QR code from WhatsApp > Linked Devices.

**For Convex auth mode** (`WHATSAPP_AUTH_MODE=convex`):

```bash
# Clear all session entries from Convex
bunx convex run whatsappSession.clearAll
```

If `clearAll` doesn't exist, clear entries manually from the Convex dashboard (`whatsappSession` table, delete all rows).

Then restart the worker and scan the new QR code.

### Verification

- Worker logs: `[whatsapp] Connected successfully`
- Axiom event: `whatsapp.connection.established`
- Send a test message from an allowed contact; expect a response.

### Rollback

Auth reset always requires a new QR scan. There is no way to recover a corrupted session without re-linking.

---

## 5. Duplicate Message Processing

### Symptoms

- Users receive the same response multiple times.
- `messages` table shows duplicate entries for the same inbound message.
- Axiom: Multiple `whatsapp.inbound.queued` events for the same phone within seconds.

### Root Cause

1. **Provider retries**: WhatsApp/Baileys delivers the same message event multiple times.
2. **Dedupe table not populated**: The `inboundDedupe` table may be empty (new deployment) or the dedupe check was bypassed.
3. **Message without `key.id`**: Some message types may not have a `key.id`, bypassing dedupe.

### Remediation

1. **Verify dedupe is active**: Check for `whatsapp.inbound.dedupe_skipped` events in Axiom. If none exist, dedupe may not be running.

2. **Check the inboundDedupe table**:

   ```bash
   bunx convex run inboundDedupe.checkAndRegister '{"channel":"whatsapp","channelMessageId":"test-123"}'
   ```

   If this returns an error, the table or function may not be deployed.

3. **For already-duplicated messages**: No automated fix. The duplicate responses were already sent. Inform the user if needed.

### Verification

- Send a test message. Check that only one `whatsapp.inbound.queued` event fires.
- Axiom should show `whatsapp.inbound.dedupe_skipped` for any retry of the same message.

### Rollback

Dedupe is append-only and safe. No rollback needed.

---

## 6. Agent Model Failures (all providers down)

### Symptoms

- All jobs failing with `agent.job.failed` events.
- Error reason contains `rate_limit`, `server_error`, or `authentication`.
- Axiom events: `agent.model.fallback.used` followed by `agent.job.failed`.

### Root Cause

1. **Primary and fallback models both unavailable**: API outage or rate limit exhaustion.
2. **Invalid API key**: `AI_GATEWAY_API_KEY` expired or misconfigured.
3. **Model ID changed**: Provider renamed or deprecated the model.

### Remediation

1. **Check provider status pages** for the models in `AI_MODEL` and fallback.

2. **Verify API key**:

   ```bash
   # Quick test (from a machine with the key)
   curl -H "Authorization: Bearer $AI_GATEWAY_API_KEY" https://gateway.ai.cloudflare.com/...
   ```

3. **If rate limited**: Wait for rate limit window to expire (usually 1-5 minutes). Jobs will be retried automatically.

4. **If model deprecated**: Update `AI_MODEL` env var to a valid model ID and restart.

### Verification

- New jobs succeed: `agent.job.completed` events appear.
- No more `agent.job.failed` events with provider errors.

### Rollback

Revert `AI_MODEL` to the previous value if the new model causes issues.

---

## Axiom Query Reference

Common queries for investigating incidents:

```
// All failed jobs in last hour
event == "agent.job.failed" | summarize count() by errorReason

// Lease lifecycle for an account
event matches "whatsapp.lease.*" and accountId == "default" | sort by _time

// Heartbeat health
event == "whatsapp.lease.heartbeat.lost" | summarize count() by bin(_time, 5m)

// Duplicate detection rate
event == "whatsapp.inbound.dedupe_skipped" | summarize count() by bin(_time, 1h)

// Model fallback frequency
event == "agent.model.fallback.used" | summarize count() by originalModel, fallbackModel

// Note-tool request lifecycle for a specific job
event == "agent.notes.tool.request.started" and jobId == "job-123" | order by _time desc | project _time, toolName, outcome, durationMs, error

// Tool-call summary for a suspect job
event == "agent.loop.tool_calls" and jobId == "job-123" | project _time, generationMode, noteToolCalls, noteCreationSuccessCount, noteCreationFailureCount, noteTools

// Empty or malformed note bodies (prevents creation)
event in ("agent.notes.tool.empty_content", "agent.notes.tool.request.outcome") and conversationId == "conv-abc" | order by _time desc
```
