# Repository Guidelines

## Project Structure & Module Organization
- `apps/web` houses the Next.js UI (`src/components`, `src/app`, and `src/lib`).
- `apps/backend/convex` contains Convex functions, schema, and generated types.
- `apps/agent/src` is the Bun-based agent runtime.
- `packages/config` stores shared TypeScript config (`tsconfig.base.json`).
- `packages/env` centralizes environment validation and shared env helpers.
- App-specific configuration lives in `apps/*/.env.local` (do not commit secrets).

## Build, Test, and Development Commands
- `bun install` installs workspace dependencies.
- `bun run build` runs the Turborepo build pipeline across apps.
- `bun run typecheck` runs workspace typechecks via Turbo.
- `bun run lint` runs Oxlint at the repo root; use `bun run format` for Oxfmt.
- `bun run check` runs lint + format check in one step.
- `cd apps/web && bun run dev` starts the Next.js app.
- `cd apps/backend && bun run dev` starts Convex locally; `bun run dev:setup` bootstraps a new Convex project.
- `cd apps/agent && bun run dev` runs the agent with Bun in watch mode.
- `bun run clean` and `bun run clean:workspaces` remove build artifacts (destructive).

## Coding Style & Naming Conventions
- TypeScript-first codebase; prefer explicit types over `any` (disallowed by lint).
- Formatting is enforced by Oxfmt: tab indentation (width 2) and double quotes.
- Import ordering is auto-sorted by Oxfmt; keep groups intact.
- Unused parameters should be prefixed with `_` to satisfy lint rules.
- File and component names generally use kebab-case (e.g., `chat-layout.tsx`).

## Testing Guidelines
- No dedicated test runner is configured yet. Use `bun run typecheck` and `bun run check` for validation.
- If you introduce tests, co-locate them and follow `*.test.ts(x)` naming for consistency.

## Commit & Pull Request Guidelines
- Commits in this repo use short, imperative summaries (e.g., “Add user sync script”).
- PRs should include: a concise description, relevant issue links, and tests run.
- UI changes in `apps/web` should include screenshots or short clips.

## Configuration & Security
- Secrets belong in `apps/*/.env.local` and Convex dashboards; never commit credentials.
- Keep `turbo.json` in sync when adding new build or check tasks.
