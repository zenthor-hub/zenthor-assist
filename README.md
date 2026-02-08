# zenthor-assist

Monorepo for Zenthor Assist: web app, Convex backend, and long-running AI agent workers.

## Stack

- Bun workspaces + Turborepo
- `apps/web`: Next.js 16 + React 19 + TailwindCSS v4 + shadcn/ui + Clerk
- `apps/backend`: Convex functions/schema + Clerk sync/webhooks
- `apps/agent`: Bun runtime using AI SDK + optional WhatsApp (Baileys)
- Shared packages: `@zenthor-assist/config`, `@zenthor-assist/env`, `@zenthor-assist/observability`, `@zenthor-assist/agent-plugins`

## Prerequisites

- Bun `1.3.8+`
- A Convex project
- Clerk app/JWT template for Convex auth
- AI Gateway API key for agent runtime

## Getting Started

1. Install dependencies:

```bash
bun install
```

2. Configure backend (first time):

```bash
cd apps/backend
bun run dev:setup
```

3. Set environment variables:

- Web (`apps/web/.env.local`):
  - `NEXT_PUBLIC_CONVEX_URL`
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- Agent (`apps/agent/.env.local`):
  - `CONVEX_URL`
  - `AI_GATEWAY_API_KEY`
  - `AGENT_SECRET` (must match backend `AGENT_SECRET` for service-authenticated calls)
- Convex Dashboard env:
  - `CLERK_JWT_ISSUER_DOMAIN`
  - `CLERK_WEBHOOK_SECRET`
  - `CLERK_SECRET_KEY`
  - `AGENT_SECRET` (required in production for service endpoints)
  - `ADMIN_EMAIL_ALLOWLIST` (optional comma-separated admin emails)
  - `TODOIST_CLIENT_ID` (optional, required for Todoist OAuth integration)
  - `TODOIST_CLIENT_SECRET` (optional, required for Todoist OAuth integration)
  - `TODOIST_OAUTH_REDIRECT_URI` (optional, required for Todoist OAuth integration)
  - `TODOIST_OAUTH_SCOPE` (optional, defaults to `data:read_write`)

4. Auth model notes:

- Backend public function wrappers use three modes:
  - `authQuery` / `authMutation`: authenticated user access
  - `adminQuery` / `adminMutation`: admin-only access
  - `serviceQuery` / `serviceMutation`: trusted runtime/service access (requires `AGENT_SECRET`)
- Raw public `query`/`mutation` should be reserved for explicit public/bootstrapping paths only.

5. Start local services (separate terminals):

```bash
# Terminal 1
cd apps/backend && bun run dev

# Terminal 2
cd apps/web && bun run dev

# Terminal 3 (optional for agent processing without WhatsApp)
cd apps/agent && bun run dev:core
```

## Common Commands

### Root

- `bun run build`
- `bun run check`
- `bun run check:fix`
- `bun run typecheck`
- `bun run knip`
- `bun run static-analysis`
- `bun run test`
- `bun run test:run`

### Workspace dev/start

- Backend:
  - `cd apps/backend && bun run dev`
  - `cd apps/backend && bun run dev:setup`
- Web:
  - `cd apps/web && bun run dev`
- Agent:
  - `cd apps/agent && bun run dev`
  - `cd apps/agent && bun run dev:core`
  - `cd apps/agent && bun run dev:whatsapp`
  - `cd apps/agent && bun run start:core`
  - `cd apps/agent && bun run start:whatsapp`

## Project Structure

```txt
zenthor-assist/
├── apps/
│   ├── web/
│   ├── backend/
│   │   └── convex/
│   └── agent/
├── packages/
│   ├── config/
│   ├── env/
│   ├── observability/
│   └── agent-plugins/
├── docs/ops/
├── AGENTS.md
└── CLAUDE.md
```

## Additional Documentation

- `AGENTS.md`: Canonical coding-agent guide for this repo.
- `CLAUDE.md`: Claude Code guidance aligned with `AGENTS.md`.
- `apps/backend/convex/README.md`: Backend-specific function/schema notes.
- `docs/ops/runtime-topology.md`: Core vs WhatsApp runtime topology.
- `docs/ops/runbook.md`: Smoke-test operations runbook.
