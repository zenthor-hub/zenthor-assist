# Refactor Summary and Goal

## Goal

Build a production-safe multi-runtime architecture where:

- AI core processing can run independently from channel transport runtimes.
- WhatsApp runs as a single-owner runtime per phone/account (no split-brain sends).
- Tooling can grow through a plugin/registry layer without coupling to WhatsApp.
- Web (Next.js/Vercel) and long-lived workers can be deployed separately with clear boundaries.

## What We Have Done

### 1) Split runtime model in `apps/agent`

- Added role-based startup with `AGENT_ROLE` in `apps/agent/src/index.ts`.
- Supported roles:
  - `core`
  - `whatsapp`
  - `whatsapp-ingress`
  - `whatsapp-egress`
  - `all` (default)
- Added dedicated entrypoints:
  - `apps/agent/src/index.core.ts`
  - `apps/agent/src/index.whatsapp-ingress.ts`
  - `apps/agent/src/index.whatsapp-egress.ts`
- Added matching scripts in `apps/agent/package.json` for dev/start by role.

### 2) WhatsApp single-instance ownership via leases

- Added Convex lease/account functions in `apps/backend/convex/whatsappLeases.ts`.
- Added runtime lease handling + heartbeat + release in `apps/agent/src/whatsapp/runtime.ts`.
- WhatsApp runtime now acquires lease per `WHATSAPP_ACCOUNT_ID` before processing.

### 3) Outbound delivery queue decoupled from core generation

- Added outbound queue API in `apps/backend/convex/delivery.ts`:
  - enqueue
  - claim
  - complete
  - fail/retry
- Core loop enqueues WhatsApp outbound jobs.
- WhatsApp egress runtime claims and sends outbound jobs.

### 4) Plugin/registry foundation

- Added backend plugin data model + APIs in `apps/backend/convex/plugins.ts`.
- Added plugin package `packages/agent-plugins/` for shared types/validation.
- Added runtime plugin loading/registry in:
  - `apps/agent/src/agent/plugins/loader.ts`
  - `apps/agent/src/agent/plugins/registry.ts`
- Agent loop now resolves tools through plugin policy + install set.

### 5) Schema and env updates

- Extended Convex schema in `apps/backend/convex/schema.ts` for:
  - `whatsappAccounts`
  - `whatsappLeases`
  - `outboundMessages`
  - plugin tables
- Updated agent env typing in `packages/env/src/agent.ts`.
- Updated generated API types (`apps/backend/convex/_generated/api.d.ts`) via Convex dev workflow.

### 6) Operations documentation

- Added runbook with exact startup and smoke test commands:
  - `docs/ops/runbook.md`

## Validation So Far

- Auth/browser smoke test was executed with `agent-browser` and Clerk test user.
- Login flow and protected dashboard access were validated in browser automation.
- HMR websocket `localhost:3334` issue was investigated; not found in repo config and did not reproduce after clearing `agent-browser` session storage.

## Current Status

- Refactor is implemented in working tree (not yet committed in this summary context).
- Core and WhatsApp responsibilities are now structurally separated while still sharing the same `apps/agent` workspace.
- Plugin growth path is in place through Convex + runtime loader.

## Remaining Acceptance Checks (Recommended Before Merge)

- Run core-only + whatsapp-only workers together and verify queue/lease behavior.
- Verify dual-worker contention (same `WHATSAPP_ACCOUNT_ID`) blocks second sender.
- Validate plugin install/policy overrides per channel.
- Run targeted lint/typecheck for changed workspaces.
