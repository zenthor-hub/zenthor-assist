# WhatsApp Cloud Runtime: Change Summary and AI Test Playbook

## Purpose

Provide an AI-agent-friendly summary of the recent `whatsapp-cloud` hardening updates and a deterministic validation flow.

## Scope

This document focuses on:

- `apps/agent/src/whatsapp-cloud/*`
- Cross-cutting changes that directly affect `whatsapp-cloud` startup and behavior

---

## Change Summary

### 1) Outbound lock window increased

- File: `apps/agent/src/whatsapp-cloud/runtime.ts`
- Change: outbound claim lock increased from `30_000` to `120_000` (`OUTBOUND_LOCK_MS`).
- Why: reduce duplicate sends caused by lock expiration during slow provider responses.

### 2) Infinite retry behavior removed in runtime

- File: `apps/agent/src/whatsapp-cloud/runtime.ts`
- Change: removed forced `retry: true` in `delivery.failOutbound`.
- Effective behavior now: backend default retry policy applies (`attemptCount < 5`), then final `failed`.
- Why: prevent unbounded retry loops.

### 3) Cloud account ID contract aligned with ingress

- File: `apps/agent/src/whatsapp-cloud/runtime.ts`
- Change: runtime now uses `accountId = "cloud-api"` (same as webhook ingestion path).
- Additional behavior: logs warning if `WHATSAPP_CLOUD_ACCOUNT_ID` is set to a different value.
- Why: avoid ingress/egress account partition mismatch.

### 4) Sender parsing hardened for non-JSON error responses

- File: `apps/agent/src/whatsapp-cloud/sender.ts`
- Change: switched from direct `response.json()` to safe `response.text()` + guarded JSON parse.
- Why: avoid crashes on non-JSON provider responses.

### 5) Role-aware required env validation

- File: `apps/agent/src/index.ts`
- Related file: `packages/env/src/agent.ts`
- Change:
  - `AI_GATEWAY_API_KEY` is no longer globally required in env schema.
  - Startup validation is now role-aware.
  - For `AGENT_ROLE=whatsapp-cloud`, required vars are:
    - `CONVEX_URL`
    - `WHATSAPP_CLOUD_ACCESS_TOKEN`
    - `WHATSAPP_CLOUD_PHONE_NUMBER_ID`
- Why: allow cloud egress worker to run without AI generation credentials.

### 6) Sentry tagging parity for cloud role

- File: `apps/agent/src/observability/sentry.ts`
- Change: explicit handling for role `whatsapp-cloud` in service/worker/channel tags.
- Why: improve observability filtering and incident triage.

---

## Runtime Contract (Post-change)

### Startup

- Command: `cd apps/agent && bun run start:whatsapp-cloud`
- Expected startup characteristics:
  - lease acquisition attempts on `whatsappLeases` for account `cloud-api`
  - outbound loop starts after lease acquisition

### Outbound processing

- Channel: `whatsapp`
- Account: `cloud-api`
- Lock duration: `120_000ms`
- Retry behavior:
  - transient/provider errors -> retried by backend until attempts exhausted
  - permanent failure -> final status `failed`

---

## Required Environment for Cloud Runtime

### Mandatory

- `CONVEX_URL`
- `WHATSAPP_CLOUD_ACCESS_TOKEN`
- `WHATSAPP_CLOUD_PHONE_NUMBER_ID`

### Strongly recommended

- `AGENT_SECRET` (required in production where backend enforces service key)
- `WHATSAPP_CLOUD_APP_SECRET` (for webhook signature verification)
- `WHATSAPP_CLOUD_VERIFY_TOKEN` (for webhook verification handshake)
- `WORKER_ID`
- `WHATSAPP_HEARTBEAT_MS`
- `WHATSAPP_LEASE_TTL_MS`

---

## AI Execution Plan (Deterministic)

## Test 0: Preflight

- Verify process starts without `AI_GATEWAY_API_KEY` when `AGENT_ROLE=whatsapp-cloud`.
- Pass criteria:
  - runtime does not fail on missing AI key
  - runtime reaches lease acquisition/outbound loop logs

## Test 1: Lease/loop health

- Start runtime and observe logs.
- Pass criteria:
  - contains "Lease acquired for account 'cloud-api'"
  - contains "Starting outbound delivery loop..."
  - no repeated lease heartbeat loss

## Test 2: Egress happy path (single send)

- Prepare outbound message via Convex Function Runner:
  1. create/get allowed contact
  2. get/create conversation (`channel=whatsapp`, `accountId=cloud-api`)
  3. insert assistant message
  4. enqueue outbound
- Pass criteria:
  - outbound row transitions `pending -> processing -> sent`
  - message is received on device
  - runtime logs include send success/wamid

## Test 3: Bounded failure behavior

- Enqueue outbound with invalid recipient or invalid token.
- Pass criteria:
  - `attemptCount` increments
  - status eventually becomes `failed` (not infinite pending/processing loop)

## Test 4: Webhook verification (GET)

- Route: `GET /whatsapp-cloud/webhook`
- Query params:
  - `hub.mode=subscribe`
  - `hub.verify_token=<configured token>`
  - `hub.challenge=<any string>`
- Pass criteria:
  - status `200`
  - response body equals challenge

## Test 5a: Inbound webhook — text message (POST, signed)

- Route: `POST /whatsapp-cloud/webhook`
- Must include header `X-Hub-Signature-256`.
- Payload must include `field: "messages"` and a `text` message.
- Pass criteria:
  - creates/uses conversation with `accountId=cloud-api`
  - creates user message
  - enqueues agent job (`agentQueue.status=pending`)

## Test 5b: Inbound webhook — audio/voice note (POST, signed)

- Route: `POST /whatsapp-cloud/webhook`
- Must include header `X-Hub-Signature-256`.
- Payload must include `field: "messages"` and an `audio` message with `id` (media ID) and optional `mime_type`.
- Pass criteria:
  - creates/uses conversation with `accountId=cloud-api`
  - creates user message with `mediaType: "audio"` and `mediaId` set
  - enqueues agent job (`agentQueue.status=pending`) with `triggerMediaType: "audio"`
  - when core processes the job, it downloads + transcribes the audio and updates the message via `updateMediaTranscript`
  - if transcription fails, the message content falls back to `"[Voice message could not be transcribed]"` (not silently dropped)

## Test 6: End-to-end with core

- Run `core` and `whatsapp-cloud` together.
- Send real inbound WhatsApp text.
- Pass criteria:
  - inbound message queued
  - core completes job
  - assistant message enqueued outbound
  - cloud runtime sends message

---

## Function Runner Payload Templates

Use Convex dashboard Function Runner for the following service mutations.  
If backend enforces service key, include `"serviceKey": "<AGENT_SECRET>"`.

## Template: create contact

Function: `contacts:create`

```json
{
  "serviceKey": "<AGENT_SECRET>",
  "phone": "<E164_OR_WA_PHONE>",
  "name": "Cloud Test Contact",
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

## Template: add assistant message

Function: `messages:addAssistantMessage`

```json
{
  "serviceKey": "<AGENT_SECRET>",
  "conversationId": "<CONVERSATION_ID>",
  "content": "Test message from whatsapp-cloud runtime",
  "channel": "whatsapp"
}
```

## Template: enqueue outbound

Function: `delivery:enqueueOutbound`

```json
{
  "serviceKey": "<AGENT_SECRET>",
  "channel": "whatsapp",
  "accountId": "cloud-api",
  "conversationId": "<CONVERSATION_ID>",
  "messageId": "<ASSISTANT_MESSAGE_ID>",
  "to": "<E164_OR_WA_PHONE>",
  "content": "Test message from whatsapp-cloud runtime",
  "metadata": {
    "kind": "assistant_message"
  }
}
```

---

## Expected Log Signals

### Healthy

- `[whatsapp-cloud] Lease acquired for account 'cloud-api'...`
- `[whatsapp-cloud] Starting outbound delivery loop...`
- `[whatsapp-cloud] Sent message to ... (wamid: ...)`

### Actionable errors

- `Missing required env var: WHATSAPP_CLOUD_ACCESS_TOKEN` or `...PHONE_NUMBER_ID`
- `Send failed to ...`
- `Lease heartbeat lost for account 'cloud-api'...`

---

## Known Limitation

- Inbound account ID is currently hardcoded to `cloud-api` in backend webhook mutation path (`apps/backend/convex/whatsappCloud/mutations.ts`).  
  Runtime was intentionally aligned to that constant to keep ingress/egress consistent.
