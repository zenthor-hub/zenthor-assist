# Dual-Mode AI Provider: Gateway + OpenAI Subscription (V3 — Implemented)

## Summary

Backward-compatible provider abstraction in `apps/agent` supporting two modes:

1. **`gateway`** (default) — AI SDK Gateway, unchanged from original behavior.
2. **`openai_subscription`** — Personal ChatGPT Plus/Pro access via Codex OAuth (modeled after `anomalyco/opencode` Codex plugin).

Railway/production deployments choose mode via `AI_PROVIDER_MODE` env var. Business logic in loop/tool flows is unaffected.

## Implementation Status

**Fully implemented.** All code changes, tests, and lint fixes are complete.

## Env Contract

### New env vars (`packages/env/src/agent.ts`)

| Var                             | Type                                 | Default                                 | Notes                                |
| ------------------------------- | ------------------------------------ | --------------------------------------- | ------------------------------------ |
| `AI_PROVIDER_MODE`              | `"gateway" \| "openai_subscription"` | `"gateway"`                             | Mode selector                        |
| `AI_SUBSCRIPTION_BASE_URL`      | string                               | `https://chatgpt.com/backend-api/codex` | Codex endpoint base                  |
| `AI_SUBSCRIPTION_CLIENT_ID`     | string                               | `app_EMoamEEZ73f0CkXaXp7hrann`          | OAuth client ID                      |
| `AI_SUBSCRIPTION_ACCESS_TOKEN`  | string                               | —                                       | Optional env-seeded token            |
| `AI_SUBSCRIPTION_REFRESH_TOKEN` | string                               | —                                       | Optional env-seeded refresh token    |
| `AI_SUBSCRIPTION_EXPIRES_AT`    | number                               | —                                       | Token expiry timestamp (ms)          |
| `AI_SUBSCRIPTION_ACCOUNT_ID`    | string                               | —                                       | ChatGPT account ID                   |
| `AI_SUBSCRIPTION_AUTH_METHOD`   | `"browser" \| "device"`              | `"device"`                              | OAuth flow method                    |
| `AI_SUBSCRIPTION_OAUTH_PORT`    | number                               | `1455`                                  | Local callback server port           |
| `AI_SUBSCRIPTION_AUTO_LOGIN`    | boolean                              | `false`                                 | Auto-trigger OAuth if no valid creds |

### Existing env behavior

- `AI_GATEWAY_API_KEY` is **required in both modes** for `core`/`all` roles (embeddings always use gateway).
- All other existing env vars are unchanged.

## Architecture

### Provider Abstraction (`apps/agent/src/agent/ai-gateway.ts`)

```
AIProvider interface:
  mode: ProviderMode
  model(modelId): LanguageModel
  embeddingModel(modelId): EmbeddingModel

getAIProvider(): Promise<AIProvider>  — async, singleton-cached
getProviderMode(): ProviderMode       — sync mode reader
normalizeModelId(mode, id): string    — strips prefix in subscription mode
getAIGateway(): GatewayProvider       — deprecated sync shim
_resetProviders(): void               — test helper
```

### Gateway branch

Uses `@ai-sdk/gateway` with `AI_GATEWAY_API_KEY`. Identical to pre-V3 behavior.

### Subscription branch

1. Calls `createSubscriptionFetch()` from token manager
2. Creates `@ai-sdk/openai` provider with dummy API key + custom fetch
3. Custom fetch: injects `Authorization: Bearer` + `ChatGPT-Account-Id` headers, rewrites `/v1/responses` and `/chat/completions` URLs to `{baseUrl}/responses`
4. Model IDs normalized: `openai/gpt-5.3-codex` → `gpt-5.3-codex` (subscription endpoint expects bare names)
5. Embeddings still routed through gateway for reliability

### Token Manager (`apps/agent/src/agent/subscription/token-manager.ts`)

5-step credential resolution:

1. In-memory cache (fast path, not expired)
2. Env vars (`AI_SUBSCRIPTION_ACCESS_TOKEN` + `AI_SUBSCRIPTION_REFRESH_TOKEN`)
3. Local file cache (`.auth/openai-subscription.json`)
4. Refresh via `refreshAccessToken(refreshToken)`
5. OAuth login if `AI_SUBSCRIPTION_AUTO_LOGIN=true`

60-second expiry buffer for proactive refresh.

### OAuth Module (`apps/agent/src/agent/subscription/oauth.ts`)

Two flows:

- **Browser flow**: local HTTP callback server on configurable port, PKCE, 5-min timeout
- **Device flow**: headless/SSH-friendly, polls `auth.openai.com` device auth endpoints

Exports pure helpers for PKCE generation, JWT claim parsing, account ID extraction, and authorize URL construction.

### CLI (`apps/agent/src/subscription-auth.ts`)

```bash
bun run auth:subscription login    # Run OAuth flow
bun run auth:subscription refresh  # Refresh existing token
bun run auth:subscription logout   # Clear cached credentials
bun run auth:subscription status   # Show credential state
```

## Files Changed

### Created

- `apps/agent/src/agent/subscription/oauth.ts` — OAuth PKCE + flows
- `apps/agent/src/agent/subscription/token-manager.ts` — Token lifecycle
- `apps/agent/src/agent/subscription/oauth.test.ts` — 20 tests
- `apps/agent/src/env-requirements.ts` — Extracted env requirement functions
- `apps/agent/src/env-requirements.test.ts` — 17 tests
- `apps/agent/src/subscription-auth.ts` — CLI entrypoint

### Modified

- `packages/env/src/agent.ts` — New env vars
- `apps/agent/src/agent/ai-gateway.ts` — Provider abstraction
- `apps/agent/src/agent/ai-gateway.test.ts` — Extended to 14 tests (was 3)
- `apps/agent/src/agent/generate.ts` — Async model resolution via `getAIProvider()`
- `apps/agent/src/agent/compact.ts` — `getAIProvider()` usage
- `apps/agent/src/agent/tools/embed.ts` — `getAIProvider()` usage
- `apps/agent/src/agent/tools/web-search.ts` — Subscription mode guard
- `apps/agent/src/agent/tools/web-search.test.ts` — Extended to 7 tests (was 6)
- `apps/agent/src/index.ts` — Extracted env checks, subscription mode logging
- `apps/agent/package.json` — Added `auth:subscription` script

## Test Coverage

| File                       | Tests | Coverage                                                                                                        |
| -------------------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| `ai-gateway.test.ts`       | 14    | Legacy shim, normalizeModelId, getProviderMode, getAIProvider (both modes), singleton, reset                    |
| `oauth.test.ts`            | 20    | PKCE generation, generateState, parseJwtClaims, extractAccountIdFromClaims, extractAccountId, buildAuthorizeUrl |
| `env-requirements.test.ts` | 17    | Role×mode matrix for required/recommended env vars                                                              |
| `web-search.test.ts`       | 7     | Gateway provider routing + subscription mode empty-object guard                                                 |

**Total: 58 new/updated tests, 359 tests pass across 29 test files.**

## Design Decisions

1. **Embeddings always use gateway** — Codex endpoint doesn't serve embeddings; gateway key is required in both modes.
2. **Web search tools disabled in subscription mode** — Provider-native search tools are incompatible with the Codex endpoint.
3. **Token persistence via local file** — `.auth/openai-subscription.json` enables token survival across restarts without env var updates.
4. **Node APIs (not Bun-specific)** — `node:http`, `node:fs` for portability; `tsconfig.json` uses `"types": ["node"]`.
5. **`createSubscriptionFetch` return type** — `(input: string | URL | Request, init?: RequestInit) => Promise<Response>` avoids Node/Bun `fetch` type conflicts.
6. **Deprecated `getAIGateway()` preserved** — Backward compatibility shim for any direct callers.

## Edge Cases Handled

1. Missing `AI_GATEWAY_API_KEY` in subscription mode → throws on `embeddingModel()` call with clear error.
2. Model ID with no prefix (e.g., `gpt-5.3-codex`) → passed through unchanged in subscription mode.
3. All credential sources exhausted + auto-login disabled → throws with actionable error message.
4. Expired tokens → proactive refresh with 60s buffer before actual expiry.
5. OAuth callback CSRF → state parameter validation on callback.
