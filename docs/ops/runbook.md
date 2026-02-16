# Agent + WhatsApp + Telegram Runbook

This runbook is a quick smoke-test guide for the split runtime setup:

- `core` worker handles AI processing.
- `whatsapp` worker owns WhatsApp socket + outbound delivery.
- `telegram` worker handles Telegram outbound queue consumption and consumes webhook inbound messages.
- Convex remains the source of truth for queue/state.

Decision reference:

- See `docs/ops/runtime-topology.md` for deployment shape, role guidance, and go/no-go criteria.
- See `docs/ops/incidents.md` for incident playbooks (stuck jobs, lease contention, auth corruption, etc.).

## 1) Start Convex

From `apps/backend`:

```bash
bunx convex dev
```

Expected signal:

- `Convex functions ready!`

Service auth precondition:

- Set backend `AGENT_SECRET` in Convex env and set the same value as `AGENT_SECRET` in the agent runtime env.
- In production, service-authenticated Convex endpoints reject requests when this secret is missing or mismatched.

## 2) Start AI Core Worker

From `apps/agent`:

```bash
AGENT_ROLE=core ENABLE_WHATSAPP=false bun run start
```

Expected logs:

- `[agent] Starting agent loop — subscribing to pending jobs...`
- `[main] Agent is running (role: core)`

## 3) Start WhatsApp Worker (Single Owner Per Phone)

From `apps/agent` in another terminal:

```bash
AGENT_ROLE=whatsapp WORKER_ID=wa-1 ENABLE_WHATSAPP=true WHATSAPP_ACCOUNT_ID=default WHATSAPP_PHONE=<your-phone> bun run start
```

Expected logs:

- `[whatsapp] Lease acquired for account 'default' by 'wa-1'`
- `[whatsapp] Connected successfully`
- `[whatsapp] Starting outbound delivery loop...`
- `[main] Agent is running (role: whatsapp)`

## 4) Start Telegram Worker

From `apps/agent` in another terminal:

```bash
AGENT_ROLE=telegram TELEGRAM_ACCOUNT_ID=default TELEGRAM_BOT_TOKEN=<telegram-bot-token> bun run start:telegram
```

Generate a webhook secret if you do not already have one:

```bash
export TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 32)"
```

Then configure it in Convex environment variables:

```bash
# Backend/Convex env (production/staging): TELEGRAM_WEBHOOK_SECRET
# Local dev: set in apps/backend/.env.local
```

Register webhook with Telegram so requests include the same secret in:

- `x-telegram-bot-api-secret-token` header for `POST /telegram/webhook`.

Expected logs:

- `[telegram] Starting outbound delivery loop...`
- `[main] Agent is running (role: telegram)`
- Confirm webhook is configured for `/telegram/webhook` with matching `TELEGRAM_WEBHOOK_SECRET`.

## 5) Start Web App

From `apps/web`:

```bash
bun run dev
```

Expected result:

- Web chat UI is available.

## Smoke Tests

### A) Web Chat Works

1. Send a message in web chat.
2. Expect assistant streaming/final response.

### B) WhatsApp End-to-End Works

1. Send a WhatsApp message from an allowed contact.
2. Expect logs across workers:
   - ingress receives/queues message
   - core processes job
   - outbound job claimed/completed
   - WhatsApp send confirmation log

### C) Lease Protection (No Split-Brain)

Start a second WhatsApp worker with the same `WHATSAPP_ACCOUNT_ID`:

```bash
AGENT_ROLE=whatsapp WORKER_ID=wa-2 ENABLE_WHATSAPP=true WHATSAPP_ACCOUNT_ID=default WHATSAPP_PHONE=<your-phone> bun run start
```

Expected logs on second worker:

- Lease held by another owner and retry loop messages.
- No outbound sends from this second worker while lease is held.

### D) Core-Only Mode Does Not Send WhatsApp

If only core is running (`ENABLE_WHATSAPP=false`):

1. WhatsApp-originated work can still be processed and queued.
2. Outbound delivery does not happen until a WhatsApp worker is running.

### E) Telegram End-to-End Works

1. Ensure Telegram webhook is configured:

```bash
curl -X POST "https://<your-telegram-service-domain>/telegram/webhook" \
  -H "Content-Type: application/json" \
  -H "x-telegram-bot-api-secret-token: $TELEGRAM_WEBHOOK_SECRET" \
  -d '{
    "message": {
      "message_id": 100,
      "date": 1700000000,
      "text": "hello from integration test",
      "chat": { "id": 123456789 }
    }
  }'
```

2. In allowed Telegram chats, send a test message from the same chat.
3. Expect:
   - Convex log/handler: mutation call and job enqueue.
   - Core worker processes the inbound message.
   - Telegram worker claims and sends outbound response message.

### F) Optional Todoist Integration Smoke Test

Preconditions:

1. Backend env has `TODOIST_CLIENT_ID`, `TODOIST_CLIENT_SECRET`, and `TODOIST_OAUTH_REDIRECT_URI`.
2. Web app is running on the same origin configured in `TODOIST_OAUTH_REDIRECT_URI`.

Steps:

1. Open `/settings` in the web app.
2. Connect Todoist from the Todoist Integration section.
3. In chat, ask the assistant to create a Todoist task.
4. Confirm task appears in Todoist and can be marked complete via chat.

## Failover & Lease Validation Scenarios

These scenarios validate that lease ownership, failover, and auth persistence work correctly. Run them before any production rollout.

### G) Graceful Owner Handoff (SIGTERM)

Validates that stopping a WhatsApp worker releases its lease and a standby takes over.

**Setup**: Two WhatsApp workers running for the same account.

```bash
# Terminal 1: Primary worker
AGENT_ROLE=whatsapp WORKER_ID=wa-1 ENABLE_WHATSAPP=true WHATSAPP_ACCOUNT_ID=default bun run start

# Terminal 2: Standby worker (will enter contention loop)
AGENT_ROLE=whatsapp WORKER_ID=wa-2 ENABLE_WHATSAPP=true WHATSAPP_ACCOUNT_ID=default bun run start
```

**Action**: Send SIGTERM to the primary worker (Ctrl+C in Terminal 1).

**Expected signals (Terminal 1 / wa-1)**:

- Axiom event: `whatsapp.lease.released` with `{ accountId: "default", ownerId: "wa-1" }`
- Process exits cleanly.

**Expected signals (Terminal 2 / wa-2)**:

- Logs: `[whatsapp] Lease acquired for account 'default' by 'wa-2'`
- Axiom event: `whatsapp.lease.acquire.success` with `{ accountId: "default", ownerId: "wa-2" }`
- Worker connects to WhatsApp and starts outbound loop.

**Verification**:

```bash
bunx convex run whatsappLeases.getLease '{"accountId":"default"}'
# Expected: ownerId == "wa-2", expiresAt in the future
```

**If it fails**: If wa-2 never acquires the lease, check that wa-1 actually released (lease might have TTL remaining). Wait for TTL to expire (default 45s), then wa-2 should acquire. See `docs/ops/incidents.md` section 2.

---

### H) Crash Recovery (kill -9 / Forced Stop)

Validates that a crashed worker's lease expires and a standby takes over after TTL.

**Setup**: Same as scenario G — two workers running.

**Action**: Force-kill the primary worker (simulates crash):

```bash
kill -9 <pid-of-wa-1>
```

**Expected signals (Terminal 2 / wa-2)**:

- Worker stays in contention loop logging `[whatsapp] Lease held by 'wa-1'...` until lease TTL expires.
- After TTL expiry (default 45s): `[whatsapp] Lease acquired for account 'default' by 'wa-2'`
- Axiom event: `whatsapp.lease.acquire.success`

**Timing**: Handoff should complete within `WHATSAPP_LEASE_TTL_MS` (default 45s) + one contention retry cycle (3s).

**Verification**:

```bash
bunx convex run whatsappLeases.getLease '{"accountId":"default"}'
# Expected: ownerId == "wa-2"
```

**If it fails**: If the lease never expires, check `expiresAt` — it should be in the past. If `expiresAt` keeps updating, another process may be heartbeating for wa-1. Use `bunx convex run whatsappLeases.listOwnedAccounts '{"ownerId":"wa-1"}'` to verify.

---

### I) Heartbeat Keeps Lease Alive Under Load

Validates that the heartbeat interval prevents lease expiry during normal operation.

**Setup**: One WhatsApp worker running with default settings.

**Action**: Let the worker run for at least 2 minutes while sending/receiving messages.

**Expected signals**:

- No `whatsapp.lease.heartbeat.lost` events in Axiom.
- Lease `expiresAt` continuously moves forward (check with repeated `getLease` calls).

**Verification**:

```bash
# Run twice, ~30s apart
bunx convex run whatsappLeases.getLease '{"accountId":"default"}'
# Expected: expiresAt increases between checks
```

**If it fails**: If `whatsapp.lease.heartbeat.lost` appears, check for:

1. Network issues between worker and Convex.
2. `WHATSAPP_HEARTBEAT_MS` set too high relative to `WHATSAPP_LEASE_TTL_MS` (heartbeat should be significantly shorter than TTL, e.g. 15s heartbeat with 45s TTL).

---

### J) Lease Contention Does Not Cause Duplicate Sends

Validates that only the lease holder sends outbound messages.

**Setup**: Two WhatsApp workers running for the same account (one active, one contending).

**Action**: Send a WhatsApp message from an allowed contact that triggers an AI response.

**Expected signals**:

- Only the active lease holder emits `whatsapp.outbound.sent`.
- The contending worker does NOT emit any `whatsapp.outbound.sent` events.
- Only one response is received on the phone.

**Verification**: Check Axiom for `whatsapp.outbound.sent` events — all should have the same `ownerId` as the lease holder.

**If it fails**: This is a critical split-brain issue. Stop both workers immediately. Check `docs/ops/incidents.md` section 2. Verify that the contending worker never passed the `acquireLease` check.

---

### K) Convex Auth Persistence (WHATSAPP_AUTH_MODE=convex)

Validates that WhatsApp session credentials survive worker restarts when using Convex-backed auth.

**Setup**: Worker with Convex auth mode.

```bash
AGENT_ROLE=whatsapp WHATSAPP_AUTH_MODE=convex WORKER_ID=wa-1 ENABLE_WHATSAPP=true WHATSAPP_ACCOUNT_ID=default bun run start
```

**Step 1**: Let the worker connect and verify it's working (scan QR if first time).

**Step 2**: Stop the worker (Ctrl+C).

**Step 3**: Verify session is persisted:

```bash
bunx convex run whatsappSession.getAll
# Expected: Multiple entries (creds, app-state-sync-key-*, etc.)
```

**Step 4**: Restart the worker with the same command.

**Expected signals on restart**:

- Worker logs: `[whatsapp] Auth mode: convex`
- Worker connects WITHOUT showing a new QR code.
- Logs: `[whatsapp] Connected successfully`
- Axiom event: `whatsapp.connection.established`

**If it fails (QR code shown again)**:

- Auth state was lost or corrupted. Check `whatsappSession` table for entries.
- If entries exist but are corrupt, clear and re-link: see `docs/ops/incidents.md` section 4.

---

### L) Local Auth Persistence (WHATSAPP_AUTH_MODE=local)

Validates that local file-based auth survives restarts.

**Setup**: Worker with local auth mode (default).

```bash
AGENT_ROLE=whatsapp WHATSAPP_AUTH_MODE=local WORKER_ID=wa-1 ENABLE_WHATSAPP=true WHATSAPP_ACCOUNT_ID=default bun run start
```

**Step 1**: Let the worker connect (scan QR if first time).

**Step 2**: Verify auth directory exists:

```bash
ls apps/agent/.whatsapp-auth/
# Expected: creds.json, app-state-sync-key-*.json, etc.
```

**Step 3**: Stop and restart the worker.

**Expected**: Worker reconnects without QR code prompt.

**If it fails**: Delete `.whatsapp-auth/` and re-link. See `docs/ops/incidents.md` section 4.

---

## Useful Convex Checks

From `apps/backend`:

```bash
# Current lease status
bunx convex run whatsappLeases.getLease '{"accountId":"default"}'
```

Expected: current lease owner and expiry info, or `null` if no lease.

```bash
# Which accounts does a worker own?
bunx convex run whatsappLeases.listOwnedAccounts '{"ownerId":"wa-1"}'
```

Expected: list containing `default` when `wa-1` owns that account lease.

```bash
# All enabled WhatsApp accounts
bunx convex run whatsappLeases.listEnabledAccounts
```

```bash
# Convex auth session entries (when using WHATSAPP_AUTH_MODE=convex)
bunx convex run whatsappSession.getAll
```

## Runtime Alert Check (Railway)

Use this command to detect operational alert conditions before incidents escalate:

```bash
cd apps/agent
bun run ops:check-alerts
```

Default checks:

- Socket reconnect burst: alert when `WebSocket closed with code 1006` is >= 10 within 10 minutes (for `agent-whatsapp-cloud` and `agent-core`).
- Socket mismatch: alert when disconnect and reconnect counts differ in the same burst window.
- WhatsApp Cloud critical events over 24h lookback:
  - `whatsapp.cloud.lease.heartbeat.lost`
  - `whatsapp.cloud.outbound.loop.error`
  - `whatsapp.cloud.send.failed`

Optional overrides:

```bash
cd apps/agent
bun run ops:check-alerts -- --environment development --burst-window 10m --lookback 24h --threshold 10 --lines 2000
```

Exit codes:

- `0` = healthy
- `2` = alert condition detected

## Validation Summary Checklist

Before production rollout, confirm all pass:

| #   | Scenario                                        | Status |
| --- | ----------------------------------------------- | ------ |
| A   | Web chat works                                  |        |
| B   | WhatsApp end-to-end works                       |        |
| C   | Lease protection (no split-brain)               |        |
| D   | Core-only mode does not send WhatsApp           |        |
| E   | Graceful owner handoff (SIGTERM)                |        |
| F   | Crash recovery (kill -9)                        |        |
| G   | Heartbeat keeps lease alive under load          |        |
| H   | Lease contention does not cause duplicate sends |        |
| I   | Convex auth persistence                         |        |
| J   | Local auth persistence                          |        |
