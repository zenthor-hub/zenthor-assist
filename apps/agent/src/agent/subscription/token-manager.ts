/**
 * Token manager for OpenAI subscription mode.
 *
 * Handles token lifecycle: env-seeded tokens, local-file cache,
 * automatic refresh, and on-demand OAuth login when auto-login is enabled.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { env } from "@zenthor-assist/env/agent";

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
// Local cache persistence (.auth/openai-subscription.json)
// ---------------------------------------------------------------------------

const AUTH_DIR = resolve(process.cwd(), ".auth");
const CACHE_PATH = resolve(AUTH_DIR, "openai-subscription.json");

function loadCachedCredentials(): SubscriptionCredentials | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const raw = readFileSync(CACHE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as SubscriptionCredentials;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCachedCredentials(creds: SubscriptionCredentials): void {
  try {
    if (!existsSync(AUTH_DIR)) {
      mkdirSync(AUTH_DIR, { recursive: true });
    }
    writeFileSync(CACHE_PATH, JSON.stringify(creds, null, 2), "utf-8");
  } catch (err) {
    void logger.lineWarn("[token-manager] Failed to save cached credentials", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

/** Buffer before actual expiry to trigger proactive refresh (60 seconds). */
const EXPIRY_BUFFER_MS = 60_000;

let cachedCreds: SubscriptionCredentials | null = null;

function isExpired(creds: SubscriptionCredentials): boolean {
  return Date.now() >= creds.expiresAt - EXPIRY_BUFFER_MS;
}

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

function applyTokenResponse(
  tokens: TokenResponse,
  prevAccountId?: string,
): SubscriptionCredentials {
  const accountId = extractAccountId(tokens) ?? prevAccountId;
  const creds: SubscriptionCredentials = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    accountId,
  };
  cachedCreds = creds;
  saveCachedCredentials(creds);
  return creds;
}

/**
 * Perform a fresh OAuth login using the configured method (browser or device).
 */
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
 *  2. Env vars (if set and not expired)
 *  3. Local file cache (if exists and not expired)
 *  4. Refresh using refresh token
 *  5. OAuth login (if auto-login is enabled)
 */
export async function getValidCredentials(): Promise<SubscriptionCredentials> {
  // 1. In-memory (fast path)
  if (cachedCreds && !isExpired(cachedCreds)) {
    return cachedCreds;
  }

  // 2. Env vars
  const envCreds = credsFromEnv();
  if (envCreds && !isExpired(envCreds)) {
    cachedCreds = envCreds;
    saveCachedCredentials(envCreds);
    return envCreds;
  }

  // 3. Local file cache
  const fileCreds = loadCachedCredentials();
  if (fileCreds && !isExpired(fileCreds)) {
    cachedCreds = fileCreds;
    return fileCreds;
  }

  // 4. Refresh using any available refresh token
  const refreshToken =
    cachedCreds?.refreshToken ?? envCreds?.refreshToken ?? fileCreds?.refreshToken;
  const prevAccountId = cachedCreds?.accountId ?? envCreds?.accountId ?? fileCreds?.accountId;

  if (refreshToken) {
    try {
      void logger.lineInfo("[token-manager] Refreshing access token...");
      const tokens = await refreshAccessToken(refreshToken);
      return applyTokenResponse(tokens, prevAccountId);
    } catch (err) {
      void logger.lineWarn("[token-manager] Token refresh failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fall through to OAuth login if auto-login enabled
    }
  }

  // 5. OAuth login (auto-login)
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
 * Clear all cached credentials (in-memory + file).
 */
export function clearCredentials(): void {
  cachedCreds = null;
  try {
    if (existsSync(CACHE_PATH)) {
      writeFileSync(CACHE_PATH, "{}", "utf-8");
    }
  } catch {
    // Ignore cleanup errors
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
