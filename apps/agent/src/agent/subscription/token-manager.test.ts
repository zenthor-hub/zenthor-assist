import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

function mockEnv(overrides: Record<string, unknown> = {}) {
  return {
    env: {
      AI_SUBSCRIPTION_AUTH_METHOD: "device",
      AI_SUBSCRIPTION_AUTO_LOGIN: false,
      AI_SUBSCRIPTION_OAUTH_PORT: 1455,
      AI_SUBSCRIPTION_BASE_URL: "https://chatgpt.com/backend-api/codex",
      AI_SUBSCRIPTION_CLIENT_ID: "test-client",
      AGENT_SECRET: "test-secret",
      ...overrides,
    },
  };
}

function mockLogger() {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      lineInfo: vi.fn(),
      lineWarn: vi.fn(),
      lineError: vi.fn(),
    },
  };
}

function makeConvexCreds(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: "convex-access",
    refreshToken: "convex-refresh",
    expiresAt: Date.now() + 3600_000,
    accountId: "convex-acct",
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers to set up mocks consistently
// ---------------------------------------------------------------------------

function setupCoreMocks(envOverrides: Record<string, unknown> = {}) {
  vi.doMock("@zenthor-assist/env/agent", () => mockEnv(envOverrides));
  vi.doMock("../../observability/logger", () => mockLogger());
  setupMockFs();
}

function setupMockFs() {
  vi.doMock("node:fs/promises", () => ({
    access: vi.fn(async () => {
      throw new Error("ENOENT");
    }),
    readFile: vi.fn(async () => {
      throw new Error("ENOENT");
    }),
    writeFile: vi.fn(async () => {}),
    mkdir: vi.fn(async () => {}),
    rename: vi.fn(async () => {}),
    rm: vi.fn(async () => {}),
  }));
}

// ---------------------------------------------------------------------------
// getValidCredentials — Convex resolution
// ---------------------------------------------------------------------------

describe("getValidCredentials (Convex persistence)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns Convex credentials when valid (before env/file)", async () => {
    const convexCreds = makeConvexCreds();
    const mockQuery = vi.fn().mockResolvedValue(convexCreds);
    const mockMutation = vi.fn().mockResolvedValue(null);

    setupCoreMocks();
    vi.doMock("../../convex/client", () => ({
      getConvexClient: () => ({ query: mockQuery, mutation: mockMutation }),
    }));
    vi.doMock("./oauth", () => ({
      refreshAccessToken: vi.fn(),
      extractAccountId: vi.fn(),
      browserOAuthFlow: vi.fn(),
      deviceOAuthFlow: vi.fn(),
    }));
    const { getValidCredentials } = await import("./token-manager");
    const result = await getValidCredentials();

    expect(result.accessToken).toBe("convex-access");
    expect(result.refreshToken).toBe("convex-refresh");
    expect(result.accountId).toBe("convex-acct");
  });

  it("persists env-seeded credentials to Convex on first use", async () => {
    const mockQuery = vi.fn().mockResolvedValue(null); // No Convex creds
    const mockMutation = vi.fn().mockResolvedValue(null);

    setupCoreMocks({
      AI_SUBSCRIPTION_ACCESS_TOKEN: "env-access",
      AI_SUBSCRIPTION_REFRESH_TOKEN: "env-refresh",
      AI_SUBSCRIPTION_EXPIRES_AT: Date.now() + 3600_000,
      AI_SUBSCRIPTION_ACCOUNT_ID: "env-acct",
    });
    vi.doMock("../../convex/client", () => ({
      getConvexClient: () => ({ query: mockQuery, mutation: mockMutation }),
    }));
    vi.doMock("./oauth", () => ({
      refreshAccessToken: vi.fn(),
      extractAccountId: vi.fn(),
      browserOAuthFlow: vi.fn(),
      deviceOAuthFlow: vi.fn(),
    }));
    const { getValidCredentials } = await import("./token-manager");
    const result = await getValidCredentials();

    expect(result.accessToken).toBe("env-access");

    // Should have called upsertByProvider to persist to Convex
    expect(mockMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "openai_subscription",
        accessToken: "env-access",
        refreshToken: "env-refresh",
      }),
    );
  });

  it("persists refreshed tokens to Convex", async () => {
    const expiredConvexCreds = makeConvexCreds({
      expiresAt: Date.now() - 120_000, // expired
    });
    const mockQuery = vi.fn().mockResolvedValue(expiredConvexCreds);
    const mockMutation = vi.fn().mockResolvedValue(null);

    setupCoreMocks();
    vi.doMock("../../convex/client", () => ({
      getConvexClient: () => ({ query: mockQuery, mutation: mockMutation }),
    }));
    vi.doMock("./oauth", () => ({
      refreshAccessToken: vi.fn().mockResolvedValue({
        access_token: "new-access",
        refresh_token: "new-refresh",
        id_token: "dummy",
        expires_in: 3600,
      }),
      extractAccountId: vi.fn().mockReturnValue("new-acct"),
      browserOAuthFlow: vi.fn(),
      deviceOAuthFlow: vi.fn(),
    }));
    const { getValidCredentials } = await import("./token-manager");
    const result = await getValidCredentials();

    expect(result.accessToken).toBe("new-access");
    expect(result.refreshToken).toBe("new-refresh");

    // Should persist refreshed tokens to Convex
    expect(mockMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "openai_subscription",
        accessToken: "new-access",
        refreshToken: "new-refresh",
      }),
    );
  });

  it("recovers from refresh failure by re-reading Convex (race recovery)", async () => {
    const expiredCreds = makeConvexCreds({
      refreshToken: "old-refresh",
      expiresAt: Date.now() - 120_000,
    });
    const freshCreds = makeConvexCreds({
      refreshToken: "newer-refresh-from-other-instance",
      expiresAt: Date.now() + 3600_000, // valid
    });

    // First call returns expired, second call returns fresh (from another instance)
    const mockQuery = vi.fn().mockResolvedValueOnce(expiredCreds).mockResolvedValueOnce(freshCreds);
    const mockMutation = vi.fn().mockResolvedValue(null);

    setupCoreMocks();
    vi.doMock("../../convex/client", () => ({
      getConvexClient: () => ({ query: mockQuery, mutation: mockMutation }),
    }));
    vi.doMock("./oauth", () => ({
      refreshAccessToken: vi.fn().mockRejectedValue(new Error("Token refresh failed: 401")),
      extractAccountId: vi.fn(),
      browserOAuthFlow: vi.fn(),
      deviceOAuthFlow: vi.fn(),
    }));
    const { getValidCredentials } = await import("./token-manager");
    const result = await getValidCredentials();

    // Should have recovered by using the fresh Convex creds
    expect(result.accessToken).toBe("convex-access");
    expect(result.refreshToken).toBe("newer-refresh-from-other-instance");

    // Should have queried Convex twice (initial + race recovery)
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("retries refresh with Convex token when initial refresh fails and Convex has expired but different token", async () => {
    const expiredCreds = makeConvexCreds({
      refreshToken: "old-refresh",
      expiresAt: Date.now() - 120_000,
    });
    const differentExpiredCreds = makeConvexCreds({
      refreshToken: "rotated-refresh-from-other-instance",
      expiresAt: Date.now() - 60_000, // also expired
    });

    const mockQuery = vi
      .fn()
      .mockResolvedValueOnce(expiredCreds)
      .mockResolvedValueOnce(differentExpiredCreds);
    const mockMutation = vi.fn().mockResolvedValue(null);

    const mockRefresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("Token refresh failed: 401")) // old token fails
      .mockResolvedValueOnce({
        // rotated token succeeds
        access_token: "recovered-access",
        refresh_token: "recovered-refresh",
        id_token: "dummy",
        expires_in: 3600,
      });

    setupCoreMocks();
    vi.doMock("../../convex/client", () => ({
      getConvexClient: () => ({ query: mockQuery, mutation: mockMutation }),
    }));
    vi.doMock("./oauth", () => ({
      refreshAccessToken: mockRefresh,
      extractAccountId: vi.fn().mockReturnValue("recovered-acct"),
      browserOAuthFlow: vi.fn(),
      deviceOAuthFlow: vi.fn(),
    }));
    const { getValidCredentials } = await import("./token-manager");
    const result = await getValidCredentials();

    expect(result.accessToken).toBe("recovered-access");
    expect(mockRefresh).toHaveBeenCalledTimes(2);
    expect(mockRefresh).toHaveBeenNthCalledWith(1, "old-refresh");
    expect(mockRefresh).toHaveBeenNthCalledWith(2, "rotated-refresh-from-other-instance");
  });

  it("falls back gracefully when Convex is unreachable", async () => {
    const mockQuery = vi.fn().mockRejectedValue(new Error("Network error"));
    const mockMutation = vi.fn().mockResolvedValue(null);

    setupCoreMocks({
      AI_SUBSCRIPTION_ACCESS_TOKEN: "env-access",
      AI_SUBSCRIPTION_REFRESH_TOKEN: "env-refresh",
      AI_SUBSCRIPTION_EXPIRES_AT: Date.now() + 3600_000,
    });
    vi.doMock("../../convex/client", () => ({
      getConvexClient: () => ({ query: mockQuery, mutation: mockMutation }),
    }));
    vi.doMock("./oauth", () => ({
      refreshAccessToken: vi.fn(),
      extractAccountId: vi.fn(),
      browserOAuthFlow: vi.fn(),
      deviceOAuthFlow: vi.fn(),
    }));
    const { getValidCredentials } = await import("./token-manager");
    const result = await getValidCredentials();

    // Should fall through to env vars
    expect(result.accessToken).toBe("env-access");
  });

  it("prefers Convex over env vars even when both are available", async () => {
    const convexCreds = makeConvexCreds({ accessToken: "convex-wins" });
    const mockQuery = vi.fn().mockResolvedValue(convexCreds);
    const mockMutation = vi.fn().mockResolvedValue(null);

    setupCoreMocks({
      AI_SUBSCRIPTION_ACCESS_TOKEN: "env-loses",
      AI_SUBSCRIPTION_REFRESH_TOKEN: "env-refresh",
      AI_SUBSCRIPTION_EXPIRES_AT: Date.now() + 3600_000,
    });
    vi.doMock("../../convex/client", () => ({
      getConvexClient: () => ({ query: mockQuery, mutation: mockMutation }),
    }));
    vi.doMock("./oauth", () => ({
      refreshAccessToken: vi.fn(),
      extractAccountId: vi.fn(),
      browserOAuthFlow: vi.fn(),
      deviceOAuthFlow: vi.fn(),
    }));
    const { getValidCredentials } = await import("./token-manager");
    const result = await getValidCredentials();

    expect(result.accessToken).toBe("convex-wins");
  });
});

// ---------------------------------------------------------------------------
// clearCredentials — Convex clearing
// ---------------------------------------------------------------------------

describe("clearCredentials (Convex persistence)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("calls clearByProvider on Convex", async () => {
    const mockMutation = vi.fn().mockResolvedValue(null);

    setupCoreMocks();
    vi.doMock("../../convex/client", () => ({
      getConvexClient: () => ({ query: vi.fn(), mutation: mockMutation }),
    }));
    vi.doMock("./oauth", () => ({
      refreshAccessToken: vi.fn(),
      extractAccountId: vi.fn(),
      browserOAuthFlow: vi.fn(),
      deviceOAuthFlow: vi.fn(),
    }));
    const { clearCredentials } = await import("./token-manager");
    await clearCredentials();

    expect(mockMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "openai_subscription",
      }),
    );
  });

  it("does not throw when Convex clear fails", async () => {
    const mockMutation = vi.fn().mockRejectedValue(new Error("Network error"));

    setupCoreMocks();
    vi.doMock("../../convex/client", () => ({
      getConvexClient: () => ({ query: vi.fn(), mutation: mockMutation }),
    }));
    vi.doMock("./oauth", () => ({
      refreshAccessToken: vi.fn(),
      extractAccountId: vi.fn(),
      browserOAuthFlow: vi.fn(),
      deviceOAuthFlow: vi.fn(),
    }));
    const { clearCredentials } = await import("./token-manager");

    // Should not throw
    await expect(clearCredentials()).resolves.toBeUndefined();
  });
});
