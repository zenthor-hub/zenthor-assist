import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@zenthor-assist/env/agent", () => ({
  env: {
    AI_SUBSCRIPTION_CLIENT_ID: "test-client-id",
    AI_SUBSCRIPTION_OAUTH_PORT: 9999,
  },
}));

vi.mock("../../observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), lineInfo: vi.fn(), lineWarn: vi.fn() },
}));

import * as oauth from "./oauth";
import {
  buildAuthorizeUrl,
  extractAccountId,
  extractAccountIdFromClaims,
  generatePKCE,
  generateState,
  parseJwtClaims,
  type IdTokenClaims,
  type TokenResponse,
} from "./oauth";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function waitForLocalServer(url: string): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    try {
      await fetch(url);
      return;
    } catch {
      // wait for server startup
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("OAuth callback server did not start in time");
}

async function waitForLocalServerStop(url: string): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    try {
      await fetch(url);
      await new Promise((resolve) => setTimeout(resolve, 10));
    } catch {
      return;
    }
  }

  throw new Error("OAuth callback server did not stop in time");
}

// ---------------------------------------------------------------------------
// PKCE generation
// ---------------------------------------------------------------------------

describe("generatePKCE", () => {
  it("returns a verifier of length 43", async () => {
    const pkce = await generatePKCE();
    expect(pkce.verifier).toHaveLength(43);
  });

  it("returns a challenge that is base64url-encoded (no +, /, or = chars)", async () => {
    const pkce = await generatePKCE();
    expect(pkce.challenge).toBeDefined();
    expect(pkce.challenge).not.toMatch(/[+/=]/);
  });

  it("produces different verifiers on each call", async () => {
    const a = await generatePKCE();
    const b = await generatePKCE();
    expect(a.verifier).not.toBe(b.verifier);
  });

  it("produces a challenge derived from the verifier (not empty)", async () => {
    const pkce = await generatePKCE();
    expect(pkce.challenge.length).toBeGreaterThan(0);
    // SHA-256 of 43 bytes -> 32 bytes -> base64url should be ~43 chars
    expect(pkce.challenge.length).toBeGreaterThanOrEqual(40);
    expect(pkce.challenge.length).toBeLessThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// generateState
// ---------------------------------------------------------------------------

describe("generateState", () => {
  it("returns a non-empty string", () => {
    const state = generateState();
    expect(state.length).toBeGreaterThan(0);
  });

  it("returns a base64url string (no +, /, or = chars)", () => {
    const state = generateState();
    expect(state).not.toMatch(/[+/=]/);
  });

  it("produces different values on each call", () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// parseJwtClaims
// ---------------------------------------------------------------------------

describe("parseJwtClaims", () => {
  function makeToken(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${header}.${body}.fake-signature`;
  }

  it("parses a valid JWT and returns claims", () => {
    const claims = parseJwtClaims(
      makeToken({
        chatgpt_account_id: "acct-123",
        email: "test@example.com",
      }),
    );
    expect(claims).toBeDefined();
    expect(claims?.chatgpt_account_id).toBe("acct-123");
    expect(claims?.email).toBe("test@example.com");
  });

  it("returns undefined for a token with fewer than 3 parts", () => {
    expect(parseJwtClaims("only.two")).toBeUndefined();
    expect(parseJwtClaims("just-one")).toBeUndefined();
  });

  it("returns undefined for invalid base64 payload", () => {
    expect(parseJwtClaims("header.!!!invalid!!!.sig")).toBeUndefined();
  });

  it("parses nested auth claims", () => {
    const claims = parseJwtClaims(
      makeToken({
        "https://api.openai.com/auth": {
          chatgpt_account_id: "nested-acct-456",
        },
      }),
    );
    expect(claims?.["https://api.openai.com/auth"]?.chatgpt_account_id).toBe("nested-acct-456");
  });
});

// ---------------------------------------------------------------------------
// extractAccountIdFromClaims
// ---------------------------------------------------------------------------

describe("extractAccountIdFromClaims", () => {
  it("returns chatgpt_account_id when present at top level", () => {
    const claims: IdTokenClaims = { chatgpt_account_id: "top-level-id" };
    expect(extractAccountIdFromClaims(claims)).toBe("top-level-id");
  });

  it("returns account id from nested auth namespace", () => {
    const claims: IdTokenClaims = {
      "https://api.openai.com/auth": { chatgpt_account_id: "nested-id" },
    };
    expect(extractAccountIdFromClaims(claims)).toBe("nested-id");
  });

  it("falls back to first organization id", () => {
    const claims: IdTokenClaims = {
      organizations: [{ id: "org-001" }, { id: "org-002" }],
    };
    expect(extractAccountIdFromClaims(claims)).toBe("org-001");
  });

  it("prefers top-level over nested and org", () => {
    const claims: IdTokenClaims = {
      chatgpt_account_id: "top",
      "https://api.openai.com/auth": { chatgpt_account_id: "nested" },
      organizations: [{ id: "org" }],
    };
    expect(extractAccountIdFromClaims(claims)).toBe("top");
  });

  it("returns undefined when no account id is present", () => {
    const claims: IdTokenClaims = { email: "test@example.com" };
    expect(extractAccountIdFromClaims(claims)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractAccountId (from TokenResponse)
// ---------------------------------------------------------------------------

describe("extractAccountId", () => {
  function makeToken(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${header}.${body}.fake-signature`;
  }

  it("extracts account id from id_token", () => {
    const tokens: TokenResponse = {
      id_token: makeToken({ chatgpt_account_id: "from-id-token" }),
      access_token: makeToken({ chatgpt_account_id: "from-access-token" }),
      refresh_token: "rt",
    };
    expect(extractAccountId(tokens)).toBe("from-id-token");
  });

  it("falls back to access_token when id_token has no account id", () => {
    const tokens: TokenResponse = {
      id_token: makeToken({ email: "no-account-here@example.com" }),
      access_token: makeToken({ chatgpt_account_id: "from-access" }),
      refresh_token: "rt",
    };
    expect(extractAccountId(tokens)).toBe("from-access");
  });

  it("returns undefined when neither token has account id", () => {
    const tokens: TokenResponse = {
      id_token: makeToken({ email: "test@example.com" }),
      access_token: makeToken({ email: "test@example.com" }),
      refresh_token: "rt",
    };
    expect(extractAccountId(tokens)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildAuthorizeUrl
// ---------------------------------------------------------------------------

describe("buildAuthorizeUrl", () => {
  it("builds a valid authorization URL with all required params", () => {
    const pkce = { verifier: "test-verifier", challenge: "test-challenge" };
    const url = buildAuthorizeUrl("http://localhost:9999/auth/callback", pkce, "test-state");
    const parsed = new URL(url);

    expect(parsed.origin).toBe("https://auth.openai.com");
    expect(parsed.pathname).toBe("/oauth/authorize");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:9999/auth/callback");
    expect(parsed.searchParams.get("scope")).toBe("openid profile email offline_access");
    expect(parsed.searchParams.get("code_challenge")).toBe("test-challenge");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe("test-state");
    expect(parsed.searchParams.get("originator")).toBe("zenthor-assist");
    expect(parsed.searchParams.get("id_token_add_organizations")).toBe("true");
    expect(parsed.searchParams.get("codex_cli_simplified_flow")).toBe("true");
  });
});

describe("browserOAuthFlow", () => {
  it("stops the local callback server on callback error response", async () => {
    const flowResult = oauth.browserOAuthFlow().then(
      (value) => ({ ok: true, value }) as const,
      (error: Error) => ({ ok: false, error }) as const,
    );
    await waitForLocalServer("http://localhost:9999/health");

    const response = await fetch("http://localhost:9999/auth/callback?error=access_denied");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Auth Failed");

    const flow = await flowResult;
    if (!flow.ok) {
      expect(flow.error).toBeInstanceOf(Error);
      expect(flow.error.message).toContain("access_denied");
    } else {
      throw new Error("Expected browserOAuthFlow to reject with access_denied");
    }
    await waitForLocalServerStop("http://localhost:9999/health");
  });

  it("stops the local callback server on timeout", async () => {
    vi.useFakeTimers();
    const flowResult = oauth.browserOAuthFlow().then(
      (value) => ({ ok: true, value }) as const,
      (error: Error) => ({ ok: false, error }) as const,
    );
    await waitForLocalServer("http://localhost:9999/health");

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    const flow = await flowResult;
    if (!flow.ok) {
      expect(flow.error).toBeInstanceOf(Error);
      expect(flow.error.message).toContain("OAuth callback timeout (5 min)");
    } else {
      throw new Error("Expected browserOAuthFlow to reject with timeout");
    }
    vi.useRealTimers();
    await waitForLocalServerStop("http://localhost:9999/health");
  });
});
