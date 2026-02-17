# AI SDK Upgrade Plan for `apps/agent`

This plan is for the `apps/agent` workspace only and intentionally starts with dependency alignment, then validation, then optional optimization.

## 1) Scope and target versions (dependency update only)

- **Goal:** Move from current versions to compatible latest patch/minor versions from the `@ai-sdk` stack.
- **Root catalog:**
  - `package.json`: `ai` from `^6.0.77` to `^6.0.86`
- **Agent workspace dependencies (`apps/agent/package.json`):**
  - `@ai-sdk/anthropic`: `^3.0.38` -> `^3.0.43`
  - `@ai-sdk/gateway`: `^3.0.29` -> `^3.0.46`
  - `@ai-sdk/google`: `^3.0.22` -> `^3.0.29`
  - `@ai-sdk/openai`: `^3.0.26` -> `^3.0.28`
  - `@ai-sdk/xai`: `^3.0.48` -> `^3.0.57`
- **Do not change runtime logic in this phase.**

## 2) Apply dependency changes

1. Update the two package files above.
2. Run dependency install at workspace root:
   - `bun install`
3. Ensure lockfiles update cleanly and there are no unexpected deletions/additions outside `bun.lockb`/lock artifacts and the two edited JSON files.

## 3) Compatibility and type/runtime checks (targeted)

Run in repository root:

- `bun run lint`
- `bun run format:check`
- `bun run typecheck`

Targeted test pass (agent-focused):

- `bun run test:run -- apps/agent/src/agent/ai-gateway.test.ts`
- `bun run test:run -- apps/agent/src/agent/generate.ts`

If repo-level `test:run` command is expensive, keep the above targeted passes first.

## 4) Critical runtime flow verification

Validate behavior in `apps/agent/src/agent/generate.ts` and related provider modules after upgrade:

- Gateway mode path: non-streaming generation still works.
- Subscription mode path: provider options + instruction handling still work (`providerOptions.openai.instructions` in stream flow).
- Streaming generation: `generateResponseStreaming` still emits chunks and resolves final content.
- Tool call fallback logic remains intact:
  - `shouldRetryWithoutProviderSearch`
  - `removeProviderSearchTools`
  - `resolveToolsForModel`
- Fallback cascade still works:
  - `apps/agent/src/agent/model-fallback.ts`
  - `apps/agent/src/agent/model-router.ts`
- Provider wiring still valid:
  - `apps/agent/src/agent/ai-gateway.ts`
  - `apps/agent/src/agent/tools/web-search.ts`
  - `apps/agent/src/agent/subscription/token-manager.ts`
  - `apps/agent/src/agent/subscription/oauth.ts`

## 5) Monitoring after deploy to lower environment

Watch logs for:

- Provider routing changes:
  - `agent.model.route.selected`
- Generation start/end:
  - `agent.model.generate.started`
  - `agent.model.generate.completed`
- Tool/search fallback events:
  - `agent.model.search_tool.fallback`
- Model fallback events:
  - `agent.model.fallback.used`

If failures increase, collect stack traces from:

- `app.model.generate.*`
- provider adapter errors in `apps/agent/src/agent/generate.ts` and `apps/agent/src/agent/ai-gateway.ts`

## 6) Rollback plan

If regressions are found:

1. Revert only:
   - `apps/agent/package.json`
   - root `package.json`
   - lockfile changes from `bun install`
2. Re-run:
   - `bun run lint`
   - `bun run format:check`
   - `bun run typecheck`
   - same targeted tests in step 3
3. Keep remaining work in a follow-up PR once issues are isolated.

## 7) Optional phase 2 (after phase 1 is stable)

- Evaluate AI SDK-native higher-level agent abstractions for potential simplification of custom tool-loop logic.
- Introduce only after typecheck/tests are green and behavior is stable.
