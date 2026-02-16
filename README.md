# zenthor-assist

Monorepo for Zenthor Assist: web app, Convex backend, and long-running AI agent workers.

## Stack

- Bun workspaces + Turborepo
- `apps/web`: Next.js 16 + React 19 + TailwindCSS v4 + shadcn/ui + Clerk
- `apps/backend`: Convex functions/schema + Clerk sync/webhooks
- `apps/agent`: Bun runtime using AI SDK + WhatsApp (Baileys) + Telegram bot worker
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

Notes for backend TypeScript setup:

- `apps/backend` uses `@typescript/native-preview` with Convex `tsgo` (`apps/backend/convex.json`) so TypeScript 7 native checks only apply to backend Convex code.
- `apps/backend/package.json` intentionally uses:
  - `bunx @typescript/native-preview -p convex/tsconfig.json --noEmit`
- Avoid adding a `tsc` subcommand here, because the native wrapper can interpret it as an input file and trigger `TS5042: Option 'project' cannot be mixed with source files on a command line`.

3. Set environment variables:

- Web (`apps/web/.env.local`):
  - `NEXT_PUBLIC_CONVEX_URL`
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- Agent (`apps/agent/.env.local`):
  - `CONVEX_URL`
  - `AI_GATEWAY_API_KEY` (required for `core`/`all` roles; not needed for `whatsapp-cloud`)
  - `AGENT_SECRET` (must match backend `AGENT_SECRET` for service-authenticated calls)
  - `AGENT_ROLE` — one of `all | core | whatsapp | whatsapp-ingress | whatsapp-egress | whatsapp-cloud | telegram`
  - `GROQ_API_KEY` (recommended for `core`/`all` — WhatsApp voice note transcription)
  - `BLOB_READ_WRITE_TOKEN` (recommended for `core`/`all` — audio blob storage)
  - For `whatsapp-cloud` role: `WHATSAPP_CLOUD_ACCESS_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID`
  - For `telegram` role: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ACCOUNT_ID`
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
  - `TELEGRAM_WEBHOOK_SECRET` (required for Telegram webhook verification)
  - `WHATSAPP_CLOUD_APP_SECRET` (optional; enables webhook signature verification)
  - `WHATSAPP_CLOUD_VERIFY_TOKEN` (optional; webhook verification handshake token)

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

### Railway env scoping (important)

- Runtime services are split by role (for example `agent-core` and `agent-whatsapp-cloud`).
- Set env vars per **service + environment** (for example `development` vs `production`).
- Do not assume a value configured on `agent-core` is also set on `agent-whatsapp-cloud`.
- Keep shared secrets/telemetry vars synced across relevant services (`AGENT_SECRET`, `AXIOM_TOKEN`, `AXIOM_DATASET`, `OBS_*`, model/provider vars).
- Local `apps/agent/.env.local` is a source of truth for development, but deployment values still need to be explicitly synced to each Railway service/environment.

### Railway env checklist (copy/paste)

- `agent-core`

```env
AGENT_ROLE=core
ENABLE_WHATSAPP=false
CONVEX_URL=<your-convex-url>
AI_GATEWAY_API_KEY=<gateway-key>
AGENT_SECRET=<same-as-convex>
WORKER_ID=agent-core-<env>
```

- `agent-whatsapp-cloud`

```env
AGENT_ROLE=whatsapp-cloud
CONVEX_URL=<your-convex-url>
AGENT_SECRET=<same-as-convex>
WHATSAPP_CLOUD_ACCESS_TOKEN=<whatsapp-cloud-access-token>
WHATSAPP_CLOUD_PHONE_NUMBER_ID=<phone-number-id>
WORKER_ID=agent-whatsapp-cloud-<env>
```

- `agent-telegram`

```env
AGENT_ROLE=telegram
CONVEX_URL=<your-convex-url>
AGENT_SECRET=<same-as-convex>
TELEGRAM_BOT_TOKEN=<telegram-bot-token>
TELEGRAM_ACCOUNT_ID=default
WORKER_ID=agent-telegram-<env>
TELEGRAM_WEBHOOK_SECRET=<telegram-webhook-secret>
```

Start command examples:

- `agent-core`: `AGENT_ROLE=core bun run start:core`
- `agent-whatsapp-cloud`: `bun run start:whatsapp-cloud`
- `agent-telegram`: `AGENT_ROLE=telegram bun run start:telegram`

Convex env (deployment):

- `AGENT_SECRET=<same-as-agents>`
- `TELEGRAM_WEBHOOK_SECRET=<same-as-agent-telegram>`
- Clerk vars (`CLERK_JWT_ISSUER_DOMAIN`, `CLERK_WEBHOOK_SECRET`, `CLERK_SECRET_KEY`)
- Use `CONVEX_SITE_URL` (ends in `.convex.site`) for webhook registration.

Telegram webhook registration:

```bash
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<convex-site-url>/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

`CONVEX_URL` is still `.convex.cloud` and is used for client/API calls only.

#### One-click paste: all service env blocks

```text
# ---- agent-core ----
AGENT_ROLE=core
ENABLE_WHATSAPP=false
CONVEX_URL=<your-convex-url>
AI_GATEWAY_API_KEY=<gateway-key>
AGENT_SECRET=<same-as-convex>
WORKER_ID=agent-core-<env>

# ---- agent-whatsapp-cloud ----
AGENT_ROLE=whatsapp-cloud
CONVEX_URL=<your-convex-url>
AGENT_SECRET=<same-as-convex>
WHATSAPP_CLOUD_ACCESS_TOKEN=<whatsapp-cloud-access-token>
WHATSAPP_CLOUD_PHONE_NUMBER_ID=<phone-number-id>
WORKER_ID=agent-whatsapp-cloud-<env>

# ---- agent-telegram ----
AGENT_ROLE=telegram
CONVEX_URL=<your-convex-url>
AGENT_SECRET=<same-as-convex>
TELEGRAM_BOT_TOKEN=<telegram-bot-token>
TELEGRAM_ACCOUNT_ID=default
WORKER_ID=agent-telegram-<env>
TELEGRAM_WEBHOOK_SECRET=<telegram-webhook-secret>
```

For per-environment copy/paste files, use:

- `.env.railway.example` (template with required and recommended fields per service).

#### One command/paste helper: generate `tmp/railway.env`

```bash
cat > tmp/railway.env <<'EOF'
# agent-core
AGENT_ROLE=core
ENABLE_WHATSAPP=false
CONVEX_URL=<your-convex-url>
AI_GATEWAY_API_KEY=<gateway-key>
AGENT_SECRET=<same-as-convex>
WORKER_ID=agent-core-<env>

# agent-whatsapp-cloud
AGENT_ROLE=whatsapp-cloud
CONVEX_URL=<your-convex-url>
AGENT_SECRET=<same-as-convex>
WHATSAPP_CLOUD_ACCESS_TOKEN=<whatsapp-cloud-access-token>
WHATSAPP_CLOUD_PHONE_NUMBER_ID=<phone-number-id>
WORKER_ID=agent-whatsapp-cloud-<env>

# agent-telegram
AGENT_ROLE=telegram
CONVEX_URL=<your-convex-url>
AGENT_SECRET=<same-as-convex>
TELEGRAM_BOT_TOKEN=<telegram-bot-token>
TELEGRAM_ACCOUNT_ID=default
WORKER_ID=agent-telegram-<env>
TELEGRAM_WEBHOOK_SECRET=<telegram-webhook-secret>
EOF
```

## Release process

This repository now uses workspace-scoped release artifacts and changelogs.

- Workspace changelogs:
  - `apps/agent/CHANGELOG.md`
  - `apps/backend/CHANGELOG.md`
  - `apps/web/CHANGELOG.md`
- Monorepo changelog: `CHANGELOG.md`

### Release workflow

Use the manual GitHub Actions workflow `Release` with these inputs:

- `workspace`: `agent | backend | web`
- `bump`: `patch | minor | major`

The workflow updates the selected workspace package version, updates changelog entries,
creates a workspace-scoped tag (`agent-vX.Y.Z`, `backend-vX.Y.Z`, `web-vX.Y.Z`)
and creates a GitHub Release with generated notes.

### Workspace release commands

- `bun run scripts/release-workspace.ts -- --workspace <agent|backend|web> --bump <major|minor|patch>`
- `bun run release:agent:patch`
- `bun run release:backend:minor`
- `bun run release:web:major`
- `bun run release:check` (agent patch dry run)

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
- `cd apps/agent && bun run dev:telegram`
- `cd apps/agent && bun run dev:whatsapp`
- `cd apps/agent && bun run start:core`
- `cd apps/agent && bun run start:telegram`
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
