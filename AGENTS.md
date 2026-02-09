# Agent Guidelines for zenthor-assist

## Repository Snapshot

Verified against this repository on 2026-02-07.

- Monorepo: Bun workspaces + Turborepo
- Apps:
  - `apps/web` (`@zenthor-assist/web`) - Next.js 16 + React 19 + TailwindCSS v4 + shadcn/ui + AI Elements
  - `apps/backend` (`@zenthor-assist/backend`) - Convex backend
  - `apps/agent` (`@zenthor-assist/agent`) - Bun agent runtime (AI SDK, plugin runtime, optional WhatsApp via Baileys)
- Packages:
  - `packages/config` - shared TypeScript base config
  - `packages/env` - typed env validators for web/agent
  - `packages/observability` - shared observability context/events/logger types
  - `packages/agent-plugins` - plugin manifest/types/validators shared with runtime
- Tooling: Oxlint, Oxfmt, TypeScript, Knip, Vitest

## Core Engineering Practices

- Prefer small, focused changes over broad refactors.
- Keep functions small and readable; avoid unnecessary abstraction.
- Ensure error handling is explicit and actionable.
- Favor clear naming and consistent style across the codebase.
- Write code that is easy to test and easy to reason about.

## Command Reference (Verified)

### Root commands

| Command                    | Description                             |
| -------------------------- | --------------------------------------- |
| `bun install`              | Install dependencies for all workspaces |
| `bun run build`            | Run Turborepo build pipeline            |
| `bun run lint`             | Oxlint at repo root                     |
| `bun run lint:fix`         | Oxlint with autofix                     |
| `bun run format`           | Oxfmt write mode                        |
| `bun run format:check`     | Oxfmt check mode                        |
| `bun run check`            | `oxlint && oxfmt --check`               |
| `bun run check:fix`        | `oxlint --fix && oxfmt --write`         |
| `bun run typecheck`        | `turbo run typecheck`                   |
| `bun run knip`             | `turbo run knip --continue`             |
| `bun run knip:fix`         | `turbo run knip:fix --continue`         |
| `bun run static-analysis`  | lint + format check + typecheck + knip  |
| `bun run test`             | Run Vitest in watch mode                |
| `bun run test:run`         | Run Vitest once                         |
| `bun run clean`            | Destructive cleanup of root artifacts   |
| `bun run clean:workspaces` | Run workspace `clean` scripts           |

Important:

- There is no root `dev` script in `package.json`.
- `turbo run dev` is not configured (`dev` task missing in `turbo.json`).
- Run dev servers per workspace.

### Workspace dev/start commands

| Workspace | Command                                           | Notes                                                       |
| --------- | ------------------------------------------------- | ----------------------------------------------------------- |
| backend   | `cd apps/backend && bun run dev`                  | Starts Convex dev server                                    |
| backend   | `cd apps/backend && bun run dev:setup`            | First-time Convex bootstrap/configure                       |
| web       | `cd apps/web && bun run dev`                      | Next.js dev server (default port 3000 unless `PORT` is set) |
| agent     | `cd apps/agent && bun run dev`                    | Watch mode, default role `all`                              |
| agent     | `cd apps/agent && bun run dev:core`               | Watch mode, core processing only                            |
| agent     | `cd apps/agent && bun run dev:whatsapp`           | Watch mode, WhatsApp runtime (no core loop)                 |
| agent     | `cd apps/agent && bun run dev:whatsapp-ingress`   | Watch mode, WhatsApp ingress only                           |
| agent     | `cd apps/agent && bun run dev:whatsapp-egress`    | Watch mode, WhatsApp egress only                            |
| agent     | `cd apps/agent && bun run start:core`             | Non-watch core mode                                         |
| agent     | `cd apps/agent && bun run start:whatsapp`         | Non-watch WhatsApp mode                                     |
| agent     | `cd apps/agent && bun run start:whatsapp-ingress` | Non-watch ingress mode                                      |
| agent     | `cd apps/agent && bun run start:whatsapp-egress`  | Non-watch egress mode                                       |

## Validation Expectations

- For docs-only changes, no runtime checks are required.
- For code changes in one workspace, prefer targeted checks in that workspace:
  - `bun run lint`
  - `bun run format:check`
  - `bun run typecheck`
- For cross-workspace changes, run root checks:
  - `bun run check`
  - `bun run typecheck`
  - `bun run knip`
- For behavior/runtime logic changes, run relevant tests:
  - `bun run test:run` (full)
  - `bun run test:run -- <path-to-test-file>` (targeted)

## Project Structure

```txt
zenthor-assist/
├── apps/
│   ├── web/
│   │   ├── src/app/                  # App Router routes (route groups: (app), (auth))
│   │   ├── src/components/
│   │   │   ├── ai-elements/          # AI Elements components (owned source, not node_modules)
│   │   │   ├── chat/                 # Chat UI (chat-area, adapter hook, typing indicator)
│   │   │   └── ui/                   # shadcn/ui primitives
│   │   ├── src/hooks/
│   │   ├── src/lib/
│   │   └── src/proxy.ts              # Clerk route protection (Next 16 proxy)
│   ├── backend/
│   │   └── convex/
│   │       ├── schema.ts             # Data model
│   │       ├── http.ts               # Convex HTTP router
│   │       ├── clerk/                # Clerk webhook + sync handlers
│   │       └── _generated/           # Generated Convex types (do not edit)
│   └── agent/
│       └── src/
│           ├── agent/                # Agent loop + generation + tools + plugins
│           ├── convex/               # Convex client wiring
│           ├── observability/        # Runtime logging/sentry
│           └── whatsapp/             # Baileys integration + lease-aware runtime
├── packages/
│   ├── config/                       # Shared tsconfig.base.json
│   ├── env/                          # Typed env schemas (`./web`, `./agent`)
│   ├── observability/                # Shared telemetry helpers/types
│   └── agent-plugins/                # Plugin manifest/types/validators
├── docs/ops/                         # Runbooks/topology/deployment notes
├── turbo.json
├── .oxlintrc.json
├── .oxfmtrc.json
├── vitest.config.ts
└── AGENTS.md
```

## Architecture Notes

### Web (`apps/web`)

- Next.js 16 App Router with `typedRoutes: true` and `reactCompiler: true` (`apps/web/next.config.ts`).
- Global providers are in `apps/web/src/components/providers.tsx`:
  - Clerk auth context
  - Convex React client
  - Theme provider + Sonner toaster
  - Tooltip provider
- Protected routes are enforced in `apps/web/src/proxy.ts` for:
  - `/chat(.*)`
  - `/home(.*)`
  - `/dashboard(.*)`
  - `/skills(.*)`
  - `/settings(.*)`

### Backend (`apps/backend/convex`)

- Schema is defined in `apps/backend/convex/schema.ts`.
- Core tables:
  - `users`, `contacts`, `phoneVerifications`
  - `conversations`, `messages`, `agentQueue`
  - `agents`, `skills`, `toolApprovals`, `memories`, `scheduledTasks`
  - `todoistConnections`, `todoistOauthStates`
  - `whatsappSession`, `whatsappAccounts`, `whatsappLeases`, `outboundMessages`, `inboundDedupe`
  - `pluginDefinitions`, `pluginInstalls`, `pluginPolicies`
- Clerk webhook endpoint is mounted at `/clerk/webhook` via `apps/backend/convex/http.ts`.
- Crons in `apps/backend/convex/crons.ts` handle stale-job requeue, scheduled-task processing, and cleanup jobs.
- Convex-generated files are under `apps/backend/convex/_generated` and should not be manually edited.

#### Auth Wrapper Contract

- Public Convex endpoints should use wrappers from `apps/backend/convex/auth/`:
  - `authQuery` / `authMutation`: authenticated end-user access
  - `adminQuery` / `adminMutation`: admin-only access
  - `serviceQuery` / `serviceMutation`: trusted runtime/service access (agent/worker callers)
- Raw public `query`/`mutation` builders should only be used for explicitly public/bootstrapping endpoints.
- Service wrappers validate `serviceKey` against backend `AGENT_SECRET` and fail closed in production when the secret is missing or mismatched.
- User role is stored in `users.role` (`admin | member`) and can be derived from `ADMIN_EMAIL_ALLOWLIST` for initial assignment/backfill.

### Agent (`apps/agent`)

- Entry point: `apps/agent/src/index.ts`.
- Role entry wrappers:
  - `apps/agent/src/index.core.ts`
  - `apps/agent/src/index.whatsapp-ingress.ts`
  - `apps/agent/src/index.whatsapp-egress.ts`
- Main loop subscribes to pending jobs via `api.agent.getPendingJobs`, claims with lease/heartbeat semantics, generates responses, and writes results back to Convex.
- Web conversations use streaming placeholder updates; WhatsApp conversations are queued to outbound delivery via `api.delivery.enqueueOutbound`.
- Tools are resolved through plugin activation/policy + built-ins, then wrapped with approval flow for risky tool usage.
- Built-in tool registration starts in `apps/agent/src/agent/tools/index.ts`; provider-specific web search tooling is injected via `tools/web-search.ts`.

#### Model Routing

The agent uses dynamic multi-model routing (`model-router.ts`) to select the cheapest capable model per channel, with N-tier fallback cascade on errors (`model-fallback.ts`):

| Tier     | Channel    | Default model                          | Env var             |
| -------- | ---------- | -------------------------------------- | ------------------- |
| Lite     | WhatsApp   | `xai/grok-4.1-fast-reasoning`          | `AI_LITE_MODEL`     |
| Standard | Web        | `anthropic/claude-sonnet-4-5-20250929` | `AI_MODEL`          |
| Power    | (fallback) | `anthropic/claude-opus-4-6`            | `AI_FALLBACK_MODEL` |

- Routing is heuristic (channel + toolCount) — no LLM classifier is needed.
- Per-agent config (`agents.model` / `agents.fallbackModel`) overrides the router when set.
- `resolveModels()` in `generate.ts` checks: agent config > explicit override > router.
- If the primary model fails after retries, the fallback cascade tries each fallback in order (Lite -> Standard -> Power for WhatsApp, Standard -> Power for Web).

## Chat UI (AI Elements)

The web chat interface (`apps/web/src/components/chat/`) uses **AI Elements**, a shadcn/ui-based library installed as source files under `apps/web/src/components/ai-elements/`. These are owned source files (not in node_modules) and can be modified.

### Installed Components

- `conversation.tsx` — Auto-scrolling container + scroll-to-bottom button (via `use-stick-to-bottom`)
- `message.tsx` — Role-based message bubbles + markdown rendering via Streamdown (GFM, math, mermaid, CJK)
- `prompt-input.tsx` — Rich text input (Enter/Shift+Enter, file upload, paste support)
- `tool.tsx` — Collapsible tool call cards with status badges
- `confirmation.tsx` — AI SDK approval flow (installed but currently replaced with custom ApprovalCard usage)
- `code-block.tsx` — Syntax-highlighted code blocks via Shiki

### Adding New AI Elements

```bash
cd apps/web
bunx ai-elements@latest add <component-name>
bunx oxfmt --write src/components/ai-elements/
```

Components are ignored by knip (see `apps/web/package.json` knip config).

### Adapter Pattern

Messages come from Convex queries (not AI SDK `useChat`). The adapter hook `use-convex-messages.ts` maps Convex docs to AI Elements shapes:

```txt
Convex queries → useConvexMessages(conversationId) → { messages, isProcessing, hasStreamingMessage, pendingApprovals, sendMessage }
```

Key rules:

- `Message from={role}` matches our schema: `"user" | "assistant" | "system"`.
- `MessageResponse` handles assistant markdown rendering.
- Tool calls use `ToolHeader type="dynamic-tool" toolName={name}`.
- Tool approvals are shown with custom `ApprovalCard` + `Alert`.
- Message grouping (120s threshold, `position: first|middle|last|single`) is computed in the adapter hook.

## Environment Variables

Use `.env.local` files per app (gitignored) and Convex dashboard env for deployed Convex functions.

### Web env (`@zenthor-assist/env/web`)

Required:

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

Optional observability:

- `AXIOM_TOKEN`
- `AXIOM_DATASET`
- `OBS_ENABLED`
- `OBS_SAMPLE_RATE`
- `OBS_LOG_LEVEL`
- `OBS_INCLUDE_CONTENT`

### Agent env (`@zenthor-assist/env/agent`)

Required:

- `CONVEX_URL`
- `AI_GATEWAY_API_KEY`

Key optional:

- `AI_LITE_MODEL` (default `xai/grok-4.1-fast-reasoning`, used for WhatsApp/lite tier)
- `AI_MODEL` (default `anthropic/claude-sonnet-4-5-20250929`, used for Web/standard tier)
- `AI_FALLBACK_MODEL` (power tier fallback, used when primary model errors)
- `AI_CONTEXT_WINDOW`
- `AI_EMBEDDING_MODEL` (default `openai/text-embedding-3-small`)
- `AGENT_SECRET`
- `AGENT_ROLE` (`all | core | whatsapp | whatsapp-ingress | whatsapp-egress`)
- `WORKER_ID`
- `AGENT_JOB_LOCK_MS`
- `AGENT_JOB_HEARTBEAT_MS`
- `ENABLE_WHATSAPP`
- `WHATSAPP_ACCOUNT_ID`
- `WHATSAPP_PHONE`
- `WHATSAPP_LEASE_TTL_MS`
- `WHATSAPP_AUTH_MODE` (`local | convex`, default `local`)
- `WHATSAPP_HEARTBEAT_MS`
- `AXIOM_TOKEN`
- `AXIOM_DATASET`
- `SENTRY_DSN`
- `SENTRY_ENABLED`
- `SENTRY_TRACES_SAMPLE_RATE`
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `OBS_ENABLED`
- `OBS_SAMPLE_RATE`
- `OBS_LOG_LEVEL`
- `OBS_INCLUDE_CONTENT`

### Backend/Convex env

Required by current code:

- `CLERK_JWT_ISSUER_DOMAIN` (`auth.config.ts`)
- `CLERK_WEBHOOK_SECRET` (`clerk/http.ts`)
- `CLERK_SECRET_KEY` (`clerk/sync.ts`)

Auth/RBAC env:

- `AGENT_SECRET` (required in production for `serviceQuery`/`serviceMutation` calls)
- `ADMIN_EMAIL_ALLOWLIST` (optional comma-separated emails used to default `users.role=admin`)

Todoist integration env (optional):

- `TODOIST_CLIENT_ID`
- `TODOIST_CLIENT_SECRET`
- `TODOIST_OAUTH_REDIRECT_URI`
- `TODOIST_OAUTH_SCOPE` (defaults to `data:read_write`)

## TypeScript and Style Rules

- Base TS config (`packages/config/tsconfig.base.json`) enforces:
  - `strict: true`
  - `noUncheckedIndexedAccess: true`
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `noFallthroughCasesInSwitch: true`
  - `verbatimModuleSyntax: true`
- Lint:
  - `typescript/no-explicit-any`: error
  - `typescript/consistent-type-imports`: error
  - `eqeqeq`: error
  - `react-hooks/rules-of-hooks`: error
  - Unused vars/args must use `_` prefix to be ignored
- Formatting:
  - Tabs, width 2, double quotes, sorted imports (Oxfmt)
  - Tailwind classes are formatter-aware

## Import and Alias Conventions

- Web alias:
  - `@/*` -> `apps/web/src/*`
- Shared package imports:
  - `@zenthor-assist/backend/convex/_generated/*`
  - `@zenthor-assist/env/web`
  - `@zenthor-assist/env/agent`
  - `@zenthor-assist/observability`
  - `@zenthor-assist/agent-plugins/*`
- Agent code primarily uses relative imports for local modules.

## Generated and Sensitive Files

- Do not edit generated outputs directly:
  - `apps/backend/convex/_generated/**`
  - `.next/**`, `dist/**`, `.turbo/**`
- Do not commit secrets:
  - `.env*`, `.env*.local` are gitignored
  - `.whatsapp-auth/**` and `.auth/**` hold local auth/session artifacts

## Testing Guidance

- The repository has active tests (Vitest) in:
  - `apps/*/src/**/*.test.ts`
  - `packages/*/src/**/*.test.ts`
- Existing coverage focuses on agent reliability, policy/approval logic, and plugin validation.
- If adding tests:
  - Co-locate as `*.test.ts` or `*.test.tsx`
  - Use `bun run test:run` for CI-style runs
  - Prefer targeted runs over broad suites when iterating locally

## Documentation Canonical Set

When behavior/scripts/architecture changes, update these together in the same PR:

- `AGENTS.md` (Codex operating guide)
- `CLAUDE.md` (Claude Code operating guide)
- `README.md` (human onboarding + quickstart)
- `apps/backend/convex/README.md` (backend-specific contributor notes)
- `docs/ops/runtime-topology.md` and `docs/ops/runbook.md` (runtime operations)

## PR and Collaboration Guidelines

- Keep PRs focused on a single purpose.
- Document non-obvious decisions and tradeoffs.
- Use imperative commit messages.
- Run the most relevant checks before opening a PR.
- Include screenshots for UI changes.
