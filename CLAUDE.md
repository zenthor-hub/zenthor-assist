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

### Web UI style guide

The authenticated app follows a Vercel-inspired minimal aesthetic. All new pages and components **must** follow these patterns.

#### Page layout

- Every page uses `<PageWrapper title="…" maxWidth="…">` for consistent header (with `SidebarTrigger`), max-width constraint, and scroll behavior.
- Dashboard/overview pages use default `maxWidth="2xl"` (`1360px`). Settings/form pages use `maxWidth="md"` (`max-w-5xl`).
- Page header title: `text-sm font-semibold tracking-tight`.
- Header actions slot via `actions` prop (e.g. "New chat" button).

#### Typography scale

- **Section headings** (inline): `text-sm font-medium`.
- **Section headers** (standalone, uppercase): `text-muted-foreground text-xs font-medium tracking-wider uppercase`.
- **Body / descriptions**: `text-muted-foreground text-xs`.
- **Labels**: `text-xs` (via `<Label className="text-xs">`).
- **List item titles**: `text-xs font-medium`.
- **Stat values**: `text-xl font-semibold`.
- Never use `text-base` in the app shell — the largest inline text is `text-sm`.

#### Containers and cards

- Use `rounded-lg border p-4` for card-like sections. **Do not** use the shadcn `<Card>` component.
- List containers: `divide-border divide-y rounded-lg border` with items `px-4 py-3`.
- Stat cards: `rounded-lg border p-4` inside a `grid gap-3 sm:grid-cols-N`.
- Section spacing: `gap-6` between sibling sections, `gap-8` between top-level page sections.
- Inner component spacing: `gap-3` within a section.

#### Icons

- **Icon containers** (decorative circles): `bg-muted flex size-8 items-center justify-center rounded-full` with `size-4` icons.
- **Inline action icons** (buttons, indicators): `size-3.5`.
- **Sidebar nav icons**: `size-4`.
- **Stat/badge icons**: `size-3`.
- WhatsApp accent: `text-emerald-600 dark:text-emerald-400`.

#### Buttons

- Default action buttons: `size="sm"`.
- Secondary/danger: `variant="outline" size="sm"`.
- Loading state: `<Loader2 className="size-3.5 animate-spin" />` inside the button.

#### Empty states

- Centered layout: `flex flex-col items-center justify-center gap-3 rounded-lg border py-12` (or `py-16`).
- Muted icon `size-8`, title `text-sm font-medium`, description `text-muted-foreground text-xs`.

#### Skeletons

- `bg-muted animate-pulse rounded` (or `rounded-full` for avatars).
- Match the exact dimensions of the content they replace (e.g. `h-4 w-28` for a name, `size-12` for an avatar).

#### Sidebar

- Three-mode state: `"nav" | "chats" | "settings"` with slide animations (`animate-slide-in-right`, `animate-slide-in-left`).
- Nav items with sub-panels show `<ArrowRight className="text-muted-foreground size-3.5" />` on the right.
- Sub-panel back button (Vercel-style): `<ArrowLeft />` left + centered `<span className="flex-1 text-center font-medium">` + invisible spacer `<span className="size-4 shrink-0" />`.
- User menu trigger: avatar + name only (no email). Email shown inside dropdown.

#### Color conventions

- `text-foreground` for primary text, `text-muted-foreground` for secondary.
- `border` (default) for all borders — no explicit `border-border` unless overriding.
- Hover: `hover:bg-muted/50` for list items, `hover:bg-sidebar-accent` for sidebar items.
- Status: emerald for WhatsApp/success, red-500 for Todoist brand icon.

### Backend notes

- **Convex URL domains**: `.convex.cloud` is for the client/functions API (queries, mutations). `.convex.site` is for HTTP actions (httpRouter endpoints like webhooks). Never use `.convex.cloud` for webhook callback URLs.
- Schema in `apps/backend/convex/schema.ts`.
- HTTP router in `apps/backend/convex/http.ts` exposes webhooks at `.convex.site` paths:
  - `/clerk/webhook` (POST) — Clerk user sync
  - `/whatsapp-cloud/webhook` (GET/POST) — Meta WhatsApp Cloud API
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
- WhatsApp Cloud egress runtime in `apps/agent/src/whatsapp-cloud/` — lease-aware outbound delivery via Meta Cloud API. Run with `AGENT_ROLE=whatsapp-cloud`.
- Main loop in `apps/agent/src/agent/loop.ts`:
  - claims queue jobs with lock + heartbeat,
  - resolves plugin/builtin tools and policies,
  - handles approval-wrapped tools,
  - streams web responses and queues WhatsApp outbound messages.
- **Model routing** (`model-router.ts`): selects model tier by channel — Lite (`AI_LITE_MODEL`) for WhatsApp, Standard (`AI_MODEL`) for Web, Power (`AI_FALLBACK_MODEL`) as fallback cascade. See `AGENTS.md` "Model Routing" for full details.
- **Audio processing**: WhatsApp voice notes are downloaded, transcribed (via Groq), and optionally uploaded to blob storage. Requires `GROQ_API_KEY` and `BLOB_READ_WRITE_TOKEN` for the `core`/`all` roles. Transcription failures produce a fallback `"[Voice message could not be transcribed]"` content instead of silently dropping the message.

### Railway deployment notes

- Agent services are deployed on Railway, triggered by GitHub pushes.
- **Env var changes require a redeploy.** Updating a Railway env var (via dashboard or MCP) saves the value but the running container keeps old values in memory until restarted. Always push a commit or manually redeploy after env-only changes.
- When using Railway MCP to set env vars, use `skipDeploys=true` — the next `git push` handles redeployment.

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

- `AI_LITE_MODEL`, `AI_MODEL`, `AI_FALLBACK_MODEL`, `AI_CONTEXT_WINDOW`, `AI_EMBEDDING_MODEL`
- `AGENT_ROLE` (`all | core | whatsapp | whatsapp-ingress | whatsapp-egress | whatsapp-cloud`), `ENABLE_WHATSAPP`, `WORKER_ID`
- `AGENT_SECRET` (recommended for all roles; required in production)
- `AGENT_JOB_LOCK_MS`, `AGENT_JOB_HEARTBEAT_MS`
- `WHATSAPP_ACCOUNT_ID`, `WHATSAPP_PHONE`, `WHATSAPP_LEASE_TTL_MS`, `WHATSAPP_AUTH_MODE`, `WHATSAPP_HEARTBEAT_MS`
- `GROQ_API_KEY` (recommended for `core`/`all` — required for WhatsApp voice note transcription)
- `BLOB_READ_WRITE_TOKEN` (recommended for `core`/`all` — used for audio blob storage)

WhatsApp Cloud API env (required for `whatsapp-cloud` role):

- `WHATSAPP_CLOUD_ACCESS_TOKEN`
- `WHATSAPP_CLOUD_PHONE_NUMBER_ID`
- `WHATSAPP_CLOUD_ACCOUNT_ID` (optional; defaults to `cloud-api`)
- `WHATSAPP_CLOUD_PHONE` (optional; phone label for the cloud account)

Observability:

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
- `WHATSAPP_CLOUD_APP_SECRET` (optional; enables webhook signature verification)
- `WHATSAPP_CLOUD_VERIFY_TOKEN` (optional; webhook verification handshake token)
- `WHATSAPP_CLOUD_PHONE_NUMBER_ID` (optional; scopes webhook ingestion to a specific phone)

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
