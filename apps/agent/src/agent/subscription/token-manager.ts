/**
 * Token manager for OpenAI subscription mode.
 *
 * Handles token lifecycle with durable Convex-backed persistence so that
 * rotated refresh tokens survive Railway container restarts. Falls back
 * to env vars and local file cache when Convex is unreachable.
 *
 * Resolution order:
 *  1. In-memory cache (fast path)
 *  2. Convex store (durable, survives restarts)
 *  3. Env vars (bootstrap / initial seed)
 *  4. Local file cache (dev convenience)
 *  5. Refresh using best available refresh token
 *     - On refresh failure: re-read Convex (another instance may have rotated)
 *  6. OAuth login (if auto-login is enabled)
 */

import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { env } from "@zenthor-assist/env/agent";

import { getConvexClient } from "../../convex/client";
import { logger } from "../../observability/logger";
import {
  browserOAuthFlow,
  deviceOAuthFlow,
  extractAccountId,
  refreshAccessToken,
  type TokenResponse,
} from "./oauth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubscriptionCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER_KEY = "openai_subscription";

/** Buffer before actual expiry to trigger proactive refresh (60 seconds). */
const EXPIRY_BUFFER_MS = 60_000;

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let cachedCreds: SubscriptionCredentials | null = null;

function isExpired(creds: SubscriptionCredentials): boolean {
  return Date.now() >= creds.expiresAt - EXPIRY_BUFFER_MS;
}

// ---------------------------------------------------------------------------
// Convex persistence (durable store)
// ---------------------------------------------------------------------------

async function loadConvexCredentials(): Promise<SubscriptionCredentials | null> {
  try {
    const client = getConvexClient();
    const serviceKey = env.AGENT_SECRET;
    const result = await client.query(api.providerCredentials.getByProvider, {
      serviceKey,
      provider: PROVIDER_KEY,
    });
    if (!result || !result.accessToken || !result.refreshToken) return null;
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      accountId: result.accountId ?? undefined,
    };
  } catch (err) {
    void logger.lineWarn("[token-manager] Failed to read credentials from Convex", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function saveConvexCredentials(creds: SubscriptionCredentials): Promise<void> {
  try {
    const client = getConvexClient();
    const serviceKey = env.AGENT_SECRET;
    await client.mutation(api.providerCredentials.upsertByProvider, {
      serviceKey,
      provider: PROVIDER_KEY,
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
      expiresAt: creds.expiresAt,
      accountId: creds.accountId,
    });
  } catch (err) {
    void logger.lineWarn("[token-manager] Failed to persist credentials to Convex", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Local file cache (.auth/openai-subscription.json)
// ---------------------------------------------------------------------------

const AUTH_DIR = resolve(process.cwd(), ".auth");
const CACHE_PATH = resolve(AUTH_DIR, "openai-subscription.json");

function getCacheTempPath(): string {
  return `${CACHE_PATH}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
}

async function loadCachedCredentials(): Promise<SubscriptionCredentials | null> {
  try {
    await access(CACHE_PATH);
    const raw = await readFile(CACHE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as SubscriptionCredentials;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveCachedCredentials(creds: SubscriptionCredentials): Promise<void> {
  const tempPath = getCacheTempPath();
  try {
    await mkdir(AUTH_DIR, { recursive: true });
    await writeFile(tempPath, JSON.stringify(creds, null, 2), "utf-8");
    await rename(tempPath, CACHE_PATH);
  } catch (err) {
    void logger.lineWarn("[token-manager] Failed to save cached credentials to file", {
      error: err instanceof Error ? err.message : String(err),
    });
    await rm(tempPath, { force: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Env vars
// ---------------------------------------------------------------------------

function credsFromEnv(): SubscriptionCredentials | null {
  const accessToken = env.AI_SUBSCRIPTION_ACCESS_TOKEN;
  const refreshToken = env.AI_SUBSCRIPTION_REFRESH_TOKEN;
  if (!accessToken || !refreshToken) return null;
  return {
    accessToken,
    refreshToken,
    expiresAt: env.AI_SUBSCRIPTION_EXPIRES_AT ?? Date.now() + 3600_000,
    accountId: env.AI_SUBSCRIPTION_ACCOUNT_ID,
  };
}

// ---------------------------------------------------------------------------
// Token application (save everywhere)
// ---------------------------------------------------------------------------

async function applyTokenResponse(
  tokens: TokenResponse,
  prevAccountId?: string,
): Promise<SubscriptionCredentials> {
  const accountId = extractAccountId(tokens) ?? prevAccountId;
  const creds: SubscriptionCredentials = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    accountId,
  };
  cachedCreds = creds;
  await saveCachedCredentials(creds);
  await saveConvexCredentials(creds);
  return creds;
}

/**
 * Apply credentials from a non-token source (env, file, Convex) and
 * persist to all stores for durability.
 */
async function applyCredentials(creds: SubscriptionCredentials): Promise<SubscriptionCredentials> {
  cachedCreds = creds;
  await saveCachedCredentials(creds);
  await saveConvexCredentials(creds);
  return creds;
}

// ---------------------------------------------------------------------------
// OAuth login
// ---------------------------------------------------------------------------

async function performOAuthLogin(): Promise<SubscriptionCredentials> {
  const method = env.AI_SUBSCRIPTION_AUTH_METHOD;
  void logger.lineInfo(`[token-manager] Starting OAuth login (method: ${method})`);
  const tokens = method === "browser" ? await browserOAuthFlow() : await deviceOAuthFlow();
  return applyTokenResponse(tokens);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a valid set of subscription credentials, refreshing or
 * logging in as necessary.
 *
 * Resolution order:
 *  1. In-memory cache (if not expired)
 *  2. Convex store (durable, survives container restarts)
 *  3. Env vars (bootstrap seed from Railway env)
 *  4. Local file cache (dev convenience)
 *  5. Refresh using best available refresh token
 *     - On failure: re-read Convex in case another instance already rotated
 *  6. OAuth login (if auto-login is enabled)
 */
export async function getValidCredentials(): Promise<SubscriptionCredentials> {
  // 1. In-memory (fast path)
  if (cachedCreds && !isExpired(cachedCreds)) {
    return cachedCreds;
  }

  // 2. Convex store (durable)
  const convexCreds = await loadConvexCredentials();
  if (convexCreds && !isExpired(convexCreds)) {
    cachedCreds = convexCreds;
    await saveCachedCredentials(convexCreds);
    return convexCreds;
  }

  // 3. Env vars (bootstrap)
  const envCreds = credsFromEnv();
  if (envCreds && !isExpired(envCreds)) {
    // Persist env-seeded tokens to Convex for durability
    return applyCredentials(envCreds);
  }

  // 4. Local file cache
  const fileCreds = await loadCachedCredentials();
  if (fileCreds && !isExpired(fileCreds)) {
    // Promote file creds to Convex
    return applyCredentials(fileCreds);
  }

  // 5. Refresh using the best available refresh token
  const refreshToken =
    convexCreds?.refreshToken ??
    cachedCreds?.refreshToken ??
    envCreds?.refreshToken ??
    fileCreds?.refreshToken;
  const prevAccountId =
    convexCreds?.accountId ?? cachedCreds?.accountId ?? envCreds?.accountId ?? fileCreds?.accountId;

  if (refreshToken) {
    try {
      void logger.lineInfo("[token-manager] Refreshing access token...");
      const tokens = await refreshAccessToken(refreshToken);
      return await applyTokenResponse(tokens, prevAccountId);
    } catch (err) {
      void logger.lineWarn(
        "[token-manager] Token refresh failed, checking Convex for newer token",
        {
          error: err instanceof Error ? err.message : String(err),
        },
      );

      // Race recovery: another instance may have already rotated.
      // Re-read Convex to pick up the latest refresh token.
      const freshConvexCreds = await loadConvexCredentials();
      if (freshConvexCreds && freshConvexCreds.refreshToken !== refreshToken) {
        // A different refresh token exists — try it
        if (!isExpired(freshConvexCreds)) {
          cachedCreds = freshConvexCreds;
          await saveCachedCredentials(freshConvexCreds);
          return freshConvexCreds;
        }
        // Token is expired but has a different refresh token — try refreshing again
        try {
          void logger.lineInfo("[token-manager] Retrying refresh with Convex-stored token...");
          const retryTokens = await refreshAccessToken(freshConvexCreds.refreshToken);
          return await applyTokenResponse(retryTokens, freshConvexCreds.accountId);
        } catch (retryErr) {
          void logger.lineWarn("[token-manager] Retry refresh also failed", {
            error: retryErr instanceof Error ? retryErr.message : String(retryErr),
          });
        }
      }
      // Fall through to OAuth login if auto-login enabled
    }
  }

  // 6. OAuth login (auto-login)
  if (env.AI_SUBSCRIPTION_AUTO_LOGIN) {
    return performOAuthLogin();
  }

  throw new Error(
    "[token-manager] No valid subscription credentials available. " +
      "Set AI_SUBSCRIPTION_ACCESS_TOKEN + AI_SUBSCRIPTION_REFRESH_TOKEN, " +
      "run `bun run auth:subscription login`, or set AI_SUBSCRIPTION_AUTO_LOGIN=true.",
  );
}

/**
 * Force a fresh OAuth login regardless of cached state.
 * Useful for the CLI `auth:subscription login` command.
 */
export async function forceLogin(): Promise<SubscriptionCredentials> {
  return performOAuthLogin();
}

/**
 * Clear all cached credentials (in-memory + file + Convex).
 */
export async function clearCredentials(): Promise<void> {
  cachedCreds = null;
  try {
    await rm(CACHE_PATH, { force: true });
  } catch {
    // Ignore file cleanup errors
  }
  try {
    const client = getConvexClient();
    const serviceKey = env.AGENT_SECRET;
    await client.mutation(api.providerCredentials.clearByProvider, {
      serviceKey,
      provider: PROVIDER_KEY,
    });
  } catch (err) {
    void logger.lineWarn("[token-manager] Failed to clear Convex credentials", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Custom fetch wrapper that injects subscription auth headers
 * and rewrites the URL to the Codex endpoint.
 */
export async function createSubscriptionFetch(): Promise<
  (input: string | URL | Request, init?: RequestInit) => Promise<Response>
> {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const creds = await getValidCredentials();

    // Build headers, stripping any existing auth header
    const headers = new Headers(init?.headers);
    headers.delete("authorization");
    headers.delete("Authorization");
    headers.set("Authorization", `Bearer ${creds.accessToken}`);
    if (creds.accountId) {
      headers.set("ChatGPT-Account-Id", creds.accountId);
    }
    headers.set("User-Agent", "zenthor-assist/1.0");
    headers.set("originator", "zenthor-assist");

    // Rewrite URL: /v1/responses or /chat/completions -> Codex endpoint
    const baseUrl = env.AI_SUBSCRIPTION_BASE_URL;
    const parsed =
      input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);

    const shouldRewrite =
      parsed.pathname.includes("/v1/responses") || parsed.pathname.includes("/chat/completions");

    const url = shouldRewrite ? new URL(`${baseUrl}/responses`) : parsed;

    return fetch(url, { ...init, headers });
  };
}
