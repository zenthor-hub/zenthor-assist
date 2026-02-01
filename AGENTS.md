# Global Agent Guidelines (Codex)

## Browser Automation Tooling

- **chrome-devtools MCP**: CDP-level access for DevTools diagnostics (network, performance, console, tracing, throttling) and inspecting existing/local Chrome state.
- **Playwright MCP** or **Vercel agent-browser**: Use one for UI automation flows (navigation, clicks, form fills, screenshots). Prefer Playwright for local E2E parity; agent-browser for hosted/remote browser sessions.
- **Avoid combining Playwright MCP and agent-browser** unless explicitly needed; they are largely redundant. If you need both automation and DevTools diagnostics, pair chrome-devtools MCP with one automation tool.

## Slash Commands

| Command       | Description                                                            |
| ------------- | ---------------------------------------------------------------------- |
| `/quick-test` | Run tests for a specific file or pattern (useful for Lambda functions) |

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

- Commits in this repo use short, imperative summaries (e.g., "Add user sync script").
- PRs should include: a concise description, relevant issue links, and tests run.
- UI changes in `apps/web` should include screenshots or short clips.

## Configuration & Security

- Secrets belong in `apps/*/.env.local` and Convex dashboards; never commit credentials.
- Keep `turbo.json` in sync when adding new build or check tasks.

## Skills

A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path so you can open the source for full instructions when using a specific skill.

### Available skills

- linear: Manage issues, projects & team workflows in Linear. Use when the user wants to read, create or updates tickets in Linear. (file: /Users/gbarros/.codex/skills/linear/SKILL.md)
- skill-creator: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations. (file: /Users/gbarros/.codex/skills/.system/skill-creator/SKILL.md)
- skill-installer: Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos). (file: /Users/gbarros/.codex/skills/.system/skill-installer/SKILL.md)

### How to use skills

- Discovery: The list above is the skills available in this session (name + description + file path). Skill bodies live on disk at the listed paths.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description shown above, you must use that skill for that turn. Multiple mentions mean use them all. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill is not in the list or the path cannot be read, say so briefly and continue with the best fallback.
- How to use a skill (progressive disclosure):
  1. After deciding to use a skill, open its `SKILL.md`. Read only enough to follow the workflow.
  2. If `SKILL.md` points to extra folders such as `references/`, load only the specific files needed for the request; do not bulk-load everything.
  3. If `scripts/` exist, prefer running or patching them instead of retyping large code blocks.
  4. If `assets/` or templates exist, reuse them instead of recreating from scratch.
- Coordination and sequencing:
  - If multiple skills apply, choose the minimal set that covers the request and state the order you will use them.
  - Announce which skill(s) you are using and why (one short line). If you skip an obvious skill, say why.
- Context hygiene:
  - Keep context small: summarize long sections instead of pasting them; only load extra files when needed.
  - Avoid deep reference-chasing: prefer opening only files directly linked from `SKILL.md` unless you are blocked.
  - When variants exist (frameworks, providers, domains), pick only the relevant reference file(s) and note that choice.
- Safety and fallback: If a skill cannot be applied cleanly (missing files, unclear instructions), state the issue, pick the next-best approach, and continue.
