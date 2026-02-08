# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Primary source of truth: `AGENTS.md`. Keep these files aligned when scripts, architecture, or workflows change.

## Quick Command Reference

```bash
# Root
bun install
bun run build
bun run check
bun run check:fix
bun run typecheck
bun run knip
bun run static-analysis
bun run test
bun run test:run

# Dev servers (workspace-level; no root `dev` script)
cd apps/backend && bun run dev
cd apps/backend && bun run dev:setup
cd apps/web && bun run dev
cd apps/agent && bun run dev:core
# or: bun run dev (role `all`, includes WhatsApp runtime)
```

## Validation Strategy

- Docs-only changes: no runtime checks required.
- Single-workspace changes: run `lint`, `format:check`, and `typecheck` in that workspace.
- Cross-workspace changes: run `bun run check`, `bun run typecheck`, `bun run knip`.
- Runtime behavior changes: run `bun run test:run` (or targeted tests with `bun run test:run -- <path>`).

## Architecture Snapshot

- Monorepo: Bun workspaces + Turborepo.
- Apps:
  - `apps/web`: Next.js 16 App Router + Clerk + Convex + shadcn/ui + AI Elements.
  - `apps/backend`: Convex functions/schema (`convex/_generated` is generated).
  - `apps/agent`: Bun runtime for job processing + plugin/tool orchestration + optional WhatsApp runtime.
- Packages:
  - `packages/config`, `packages/env`, `packages/observability`, `packages/agent-plugins`.

### Web notes

- Route protection in `apps/web/src/proxy.ts` for `/chat`, `/home`, `/dashboard`, `/skills`, `/settings`.
- Providers stack in `apps/web/src/components/providers.tsx`: Theme + Clerk + Convex + Tooltip + Sonner.
- Chat UI in `apps/web/src/components/chat/` uses AI Elements from `apps/web/src/components/ai-elements/`.

### Backend notes

- Schema in `apps/backend/convex/schema.ts`.
- HTTP router in `apps/backend/convex/http.ts` exposes Clerk webhook at `/clerk/webhook`.
- Cron orchestration in `apps/backend/convex/crons.ts` handles stale-job requeue, scheduled tasks, and cleanups.
- Optional Todoist OAuth/task integration lives in `apps/backend/convex/todoist.ts`.
- Public function auth wrappers are in `apps/backend/convex/auth/`:
  - `authQuery` / `authMutation` for authenticated users
  - `adminQuery` / `adminMutation` for admin-only operations
  - `serviceQuery` / `serviceMutation` for trusted service callers (agent runtime)
- Service wrappers validate `serviceKey` against backend `AGENT_SECRET` and fail closed in production if missing/mismatched.
- `users.role` is `admin | member`; optional `ADMIN_EMAIL_ALLOWLIST` is used to default admin role assignments.

### Agent notes

- Entry point: `apps/agent/src/index.ts`.
- Role entry wrappers:
  - `apps/agent/src/index.core.ts`
  - `apps/agent/src/index.whatsapp-ingress.ts`
  - `apps/agent/src/index.whatsapp-egress.ts`
- Main loop in `apps/agent/src/agent/loop.ts`:
  - claims queue jobs with lock + heartbeat,
  - resolves plugin/builtin tools and policies,
  - handles approval-wrapped tools,
  - streams web responses and queues WhatsApp outbound messages.

## Environment Variables

### Web (`@zenthor-assist/env/web`)

Required:

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

Optional:

- `AXIOM_TOKEN`, `AXIOM_DATASET`
- `OBS_ENABLED`, `OBS_SAMPLE_RATE`, `OBS_LOG_LEVEL`, `OBS_INCLUDE_CONTENT`

### Agent (`@zenthor-assist/env/agent`)

Required:

- `CONVEX_URL`
- `AI_GATEWAY_API_KEY`

Common optional:

- `AI_MODEL`, `AI_FALLBACK_MODEL`, `AI_CONTEXT_WINDOW`, `AI_EMBEDDING_MODEL`
- `AGENT_ROLE`, `ENABLE_WHATSAPP`, `WORKER_ID`
- `AGENT_JOB_LOCK_MS`, `AGENT_JOB_HEARTBEAT_MS`
- `WHATSAPP_ACCOUNT_ID`, `WHATSAPP_PHONE`, `WHATSAPP_LEASE_TTL_MS`, `WHATSAPP_AUTH_MODE`, `WHATSAPP_HEARTBEAT_MS`
- `AXIOM_TOKEN`, `AXIOM_DATASET`
- `SENTRY_DSN`, `SENTRY_ENABLED`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`
- `OBS_ENABLED`, `OBS_SAMPLE_RATE`, `OBS_LOG_LEVEL`, `OBS_INCLUDE_CONTENT`

### Backend (Convex env)

- `CLERK_JWT_ISSUER_DOMAIN`
- `CLERK_WEBHOOK_SECRET`
- `CLERK_SECRET_KEY`
- `AGENT_SECRET` (required in production for service-wrapper endpoints)
- `ADMIN_EMAIL_ALLOWLIST` (optional comma-separated admin emails)
- `TODOIST_CLIENT_ID` (optional, required for Todoist OAuth)
- `TODOIST_CLIENT_SECRET` (optional, required for Todoist OAuth)
- `TODOIST_OAUTH_REDIRECT_URI` (optional, required for Todoist OAuth)
- `TODOIST_OAUTH_SCOPE` (optional, defaults to `data:read_write`)

## File Safety

- Do not edit generated files in `apps/backend/convex/_generated/**`.
- Do not commit secrets from `.env*`.
- Treat `.whatsapp-auth/**` and `.auth/**` as sensitive local runtime artifacts.

## Related Docs

- `AGENTS.md` - canonical contributor/agent guide
- `README.md` - onboarding and setup
- `apps/backend/convex/README.md` - backend-specific dev notes
- `docs/ops/runtime-topology.md` - role topology and scaling
- `docs/ops/runbook.md` - smoke tests and operations checklist
