# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
bun install                # Install all dependencies
bun run dev                # Start all apps (backend + web + agent) via Turbo
bun run build              # Build all apps
bun run static-analysis    # Run all checks: lint, format, typecheck, knip (dead code)
bun run check              # Lint + format check only
bun run check:fix          # Auto-fix lint + format
bun run typecheck          # TypeScript check across all workspaces
bun run knip               # Dead code detection

# Per-app dev
cd apps/backend && bun run dev       # Convex dev server
cd apps/backend && bun run dev:setup # Initial Convex project setup
cd apps/web && bun run dev           # Next.js dev server (http://localhost:3001)
cd apps/agent && bun run dev         # Agent with --watch

# Add shadcn/ui components (from apps/web)
cd apps/web && bunx shadcn@latest add <component>
```

## Architecture

This is a **Bun monorepo** (workspaces in `apps/*` and `packages/*`) using **Turborepo** for task orchestration.

### Apps

- **`apps/agent`** — Bun CLI process that subscribes to Convex for pending agent jobs, generates AI responses via Vercel AI SDK (`ai` + `@ai-sdk/gateway`), and optionally sends replies over WhatsApp (Baileys). Entry point: `src/index.ts`. Deployable via `Dockerfile.agent`.
- **`apps/backend`** — Convex backend. Database schema in `convex/schema.ts`, server functions in `convex/*.ts`. Types auto-generated in `convex/_generated/`. Clerk webhook handler in `convex/clerk/`.
- **`apps/web`** — Next.js 16 app with Clerk auth and Convex real-time subscriptions. Uses React 19, shadcn/ui, TailwindCSS v4, and React Compiler. Route protection is handled in `src/proxy.ts` (Next.js 16 replaces `middleware.ts` with `proxy.ts`). Protected routes: `/chat`, `/dashboard`.

### Packages

- **`packages/config`** — Shared `tsconfig.base.json` (strict mode, `noUncheckedIndexedAccess`, ESNext target).
- **`packages/env`** — Zod-validated environment schemas. Exports `./web` (t3-env) and `./agent`.

### Data Flow

1. User sends message (web UI or WhatsApp) → `api.messages.send` mutation creates message + `agentQueue` job
2. Agent subscribes via `client.onUpdate(api.agent.getPendingJobs)` → claims job → fetches conversation context
3. `generateResponse()` calls AI model with tools and conversation history → stores assistant message
4. Web UI receives update in real-time via Convex subscription; WhatsApp replies sent via Baileys

### Agent Tool System

Tools are defined using Vercel AI SDK's `tool()` with Zod schemas in `apps/agent/src/agent/tools/`. Register new tools by exporting from `tools/index.ts` — they're automatically available to the model.

Web search is handled separately via `getWebSearchTool()` in `tools/web-search.ts`, which detects the AI provider prefix from `AI_MODEL` (e.g. `anthropic/`, `google/`, `openai/`) and returns the corresponding provider-native search tool.

### Database Schema (Convex)

Key tables and relationships:
- **users** — synced from Clerk via webhook, indexed by `externalId` and `email`
- **contacts** — WhatsApp contacts with `isAllowed` whitelist flag, indexed by `phone`
- **conversations** — channel (`whatsapp` | `web`), linked to either `userId` or `contactId`
- **messages** — belongs to conversation, stores `role`, `content`, optional `toolCalls`
- **agentQueue** — job queue with status lifecycle: `pending` → `processing` → `completed`/`failed`
- **skills** — extensibility table (schema-ready, not yet fully wired)

## Code Style

- **Formatter**: Oxfmt — tabs, double quotes, auto-sorted imports, Tailwind class sorting
- **Linter**: Oxlint — plugins: unicorn, typescript, oxc, react, react-hooks
- **Key lint rules**: `no-explicit-any` (error), `consistent-type-imports` (error), `eqeqeq` (error), `no-console` (warn, allows info/warn/error/debug)
- **Unused vars**: Prefix with `_` to ignore (pattern: `^_`)
- **File naming**: kebab-case (e.g., `chat-area.tsx`, `nav-conversations.tsx`)
- **Convex functions**: Use `query()`, `mutation()`, `internalMutation()` from `convex/server`. Types come from `convex/_generated/`.

## Environment Variables

Agent requires `CONVEX_URL` and `AI_GATEWAY_API_KEY` (Vercel AI Gateway). `AI_MODEL` defaults to `anthropic/claude-sonnet-4-20250514` and accepts any `provider/model` string. Optional: `AGENT_SECRET`, `ENABLE_WHATSAPP`.

Web requires `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

Backend requires `CLERK_JWT_ISSUER_DOMAIN` and `CLERK_WEBHOOK_SECRET` for auth.

Use `.env.local` files per app (never committed). Run `bun run dev:setup` in `apps/backend` to configure Convex initially.
