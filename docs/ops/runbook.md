# Agent + WhatsApp Runbook

This runbook is a quick smoke-test guide for the split runtime setup:

- `core` worker handles AI processing.
- `whatsapp` worker owns WhatsApp socket + outbound delivery.
- Convex remains the source of truth for queue/state.

## 1) Start Convex

From `apps/backend`:

```bash
bunx convex dev
```

Expected signal:

- `Convex functions ready!`

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

## 4) Start Web App

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

## Useful Convex Checks

From `apps/backend`:

```bash
bunx convex run whatsappLeases.getLease '{"accountId":"default"}'
```

Expected:

- current lease owner and expiry info, or `null` if no lease.

```bash
bunx convex run whatsappLeases.listOwnedAccounts '{"ownerId":"wa-1"}'
```

Expected:

- list containing `default` when `wa-1` owns that account lease.
