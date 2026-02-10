import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Legacy getAIGateway tests (backward-compat shim)
// ---------------------------------------------------------------------------

describe("getAIGateway", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("throws when AI_GATEWAY_API_KEY is missing", async () => {
    vi.doMock("@zenthor-assist/env/agent", () => ({
      env: { AI_GATEWAY_API_KEY: undefined },
    }));

    const { getAIGateway } = await import("./ai-gateway");
    expect(() => getAIGateway()).toThrow("AI_GATEWAY_API_KEY is required for model generation");
  });

  it("returns a gateway provider that resolves grok models", async () => {
    vi.doMock("@zenthor-assist/env/agent", () => ({
      env: { AI_GATEWAY_API_KEY: "test-key" },
    }));
    vi.doMock("@ai-sdk/gateway", () => ({
      createGateway: vi.fn(() => {
        const provider = (model: string) => ({ modelId: model });
        provider.embeddingModel = (model: string) => ({ modelId: model });
        return provider;
      }),
    }));

    const { getAIGateway } = await import("./ai-gateway");
    const gw = getAIGateway();
    expect(gw).toBeDefined();
    expect(typeof gw).toBe("function");
    // Grok models are routed through the gateway as our lite tier
    const model = gw("xai/grok-4.1-fast-reasoning");
    expect(model).toEqual({ modelId: "xai/grok-4.1-fast-reasoning" });
  });

  it("returns the same instance for lite and fallback model lookups (singleton)", async () => {
    vi.doMock("@zenthor-assist/env/agent", () => ({
      env: { AI_GATEWAY_API_KEY: "test-key" },
    }));
    const createGateway = vi.fn(() => {
      const provider = (model: string) => ({ modelId: model });
      provider.embeddingModel = (model: string) => ({ modelId: model });
      return provider;
    });
    vi.doMock("@ai-sdk/gateway", () => ({ createGateway }));

    const { getAIGateway } = await import("./ai-gateway");
    const gw1 = getAIGateway();
    const gw2 = getAIGateway();
    expect(gw1).toBe(gw2);
    expect(createGateway).toHaveBeenCalledOnce();
    // Same gateway resolves both lite (grok) and fallback (opus) models
    expect(gw1("xai/grok-4.1-fast-reasoning")).toEqual({ modelId: "xai/grok-4.1-fast-reasoning" });
    expect(gw1("anthropic/claude-opus-4-6")).toEqual({ modelId: "anthropic/claude-opus-4-6" });
  });
});

// ---------------------------------------------------------------------------
// normalizeModelId
// ---------------------------------------------------------------------------

describe("normalizeModelId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("passes model ID unchanged in gateway mode", async () => {
    vi.doMock("@zenthor-assist/env/agent", () => ({
      env: {},
    }));
    vi.doMock("./subscription/token-manager", () => ({
      createSubscriptionFetch: vi.fn(),
    }));

    const { normalizeModelId } = await import("./ai-gateway");
    expect(normalizeModelId("gateway", "openai/gpt-4o")).toBe("openai/gpt-4o");
    expect(normalizeModelId("gateway", "anthropic/claude-opus-4-6")).toBe(
      "anthropic/claude-opus-4-6",
    );
  });

  it("strips provider prefix in subscription mode", async () => {
    vi.doMock("@zenthor-assist/env/agent", () => ({
      env: {},
    }));
    vi.doMock("./subscription/token-manager", () => ({
      createSubscriptionFetch: vi.fn(),
    }));

    const { normalizeModelId } = await import("./ai-gateway");
    expect(normalizeModelId("openai_subscription", "openai/gpt-5.3-codex")).toBe("gpt-5.3-codex");
    expect(normalizeModelId("openai_subscription", "xai/grok-4.1-fast-reasoning")).toBe(
      "grok-4.1-fast-reasoning",
    );
  });

  it("leaves unprefixed model IDs unchanged in subscription mode", async () => {
    vi.doMock("@zenthor-assist/env/agent", () => ({
      env: {},
    }));
    vi.doMock("./subscription/token-manager", () => ({
      createSubscriptionFetch: vi.fn(),
    }));

    const { normalizeModelId } = await import("./ai-gateway");
    expect(normalizeModelId("openai_subscription", "gpt-5.3-codex")).toBe("gpt-5.3-codex");
  });
});

// ---------------------------------------------------------------------------
// getProviderMode
// ---------------------------------------------------------------------------

describe("getProviderMode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns gateway when AI_PROVIDER_MODE is gateway", async () => {
    vi.doMock("@zenthor-assist/env/agent", () => ({
      env: { AI_PROVIDER_MODE: "gateway" },
    }));
    vi.doMock("./subscription/token-manager", () => ({
      createSubscriptionFetch: vi.fn(),
    }));

    const { getProviderMode } = await import("./ai-gateway");
    expect(getProviderMode()).toBe("gateway");
  });

  it("returns openai_subscription when configured", async () => {
    vi.doMock("@zenthor-assist/env/agent", () => ({
      env: { AI_PROVIDER_MODE: "openai_subscription" },
    }));
    vi.doMock("./subscription/token-manager", () => ({
      createSubscriptionFetch: vi.fn(),
    }));

    const { getProviderMode } = await import("./ai-gateway");
    expect(getProviderMode()).toBe("openai_subscription");
  });
});

// ---------------------------------------------------------------------------
// getAIProvider (async dual-mode)
// ---------------------------------------------------------------------------

describe("getAIProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns a gateway AIProvider when mode is gateway", async () => {
    vi.doMock("@zenthor-assist/env/agent", () => ({
      env: { AI_PROVIDER_MODE: "gateway", AI_GATEWAY_API_KEY: "test-key" },
    }));
    vi.doMock("@ai-sdk/gateway", () => ({
      createGateway: vi.fn(() => {
        const provider = (model: string) => ({ modelId: model });
        provider.embeddingModel = (model: string) => ({ modelId: model });
        return provider;
      }),
    }));
    vi.doMock("./subscription/token-manager", () => ({
      createSubscriptionFetch: vi.fn(),
    }));
    vi.doMock("../observability/logger", () => ({
      logger: { info: vi.fn(), warn: vi.fn(), lineInfo: vi.fn(), lineWarn: vi.fn() },
    }));

    const { getAIProvider, _resetProviders } = await import("./ai-gateway");
    _resetProviders();

    const provider = await getAIProvider();
    expect(provider.mode).toBe("gateway");
    expect(typeof provider.model).toBe("function");
    expect(typeof provider.embeddingModel).toBe("function");
  });

  it("throws when gateway mode is missing AI_GATEWAY_API_KEY", async () => {
    vi.doMock("@zenthor-assist/env/agent", () => ({
      env: { AI_PROVIDER_MODE: "gateway", AI_GATEWAY_API_KEY: undefined },
    }));
    vi.doMock("./subscription/token-manager", () => ({
      createSubscriptionFetch: vi.fn(),
    }));
    vi.doMock("../observability/logger", () => ({
      logger: { info: vi.fn(), warn: vi.fn(), lineInfo: vi.fn(), lineWarn: vi.fn() },
    }));

    const { getAIProvider, _resetProviders } = await import("./ai-gateway");
    _resetProviders();

    await expect(getAIProvider()).rejects.toThrow("AI_GATEWAY_API_KEY is required");
  });

  it("returns a subscription AIProvider when mode is openai_subscription", async () => {
    const mockResponses = vi.fn((model: string) => ({ modelId: model, type: "responses" }));
    const mockCreateOpenAI = vi.fn(() => ({
      responses: mockResponses,
    }));

    vi.doMock("@zenthor-assist/env/agent", () => ({
      env: {
        AI_PROVIDER_MODE: "openai_subscription",
        AI_GATEWAY_API_KEY: "gw-key-for-embeddings",
      },
    }));
    vi.doMock("@ai-sdk/openai", () => ({
      createOpenAI: mockCreateOpenAI,
    }));
    vi.doMock("@ai-sdk/gateway", () => ({
      createGateway: vi.fn(() => {
        const provider = (model: string) => ({ modelId: model });
        provider.embeddingModel = (model: string) => ({ modelId: model, type: "embedding" });
        return provider;
      }),
    }));
    vi.doMock("./subscription/token-manager", () => ({
      createSubscriptionFetch: vi.fn(async () => vi.fn()),
    }));
    vi.doMock("../observability/logger", () => ({
      logger: { info: vi.fn(), warn: vi.fn(), lineInfo: vi.fn(), lineWarn: vi.fn() },
    }));

    const { getAIProvider, _resetProviders } = await import("./ai-gateway");
    _resetProviders();

    const provider = await getAIProvider();
    expect(provider.mode).toBe("openai_subscription");

    // model() should normalize and use openai.responses()
    provider.model("openai/gpt-5.3-codex");
    expect(mockResponses).toHaveBeenCalledWith("gpt-5.3-codex");

    // embeddingModel() should fall through to gateway
    const embedding = provider.embeddingModel("openai/text-embedding-3-small");
    expect(embedding).toEqual({
      modelId: "openai/text-embedding-3-small",
      type: "embedding",
    });
  });

  it("subscription mode throws on embeddingModel when gateway key is missing", async () => {
    vi.doMock("@zenthor-assist/env/agent", () => ({
      env: {
        AI_PROVIDER_MODE: "openai_subscription",
        AI_GATEWAY_API_KEY: undefined,
      },
    }));
    vi.doMock("@ai-sdk/openai", () => ({
      createOpenAI: vi.fn(() => ({
        responses: vi.fn(),
      })),
    }));
    vi.doMock("@ai-sdk/gateway", () => ({
      createGateway: vi.fn(),
    }));
    vi.doMock("./subscription/token-manager", () => ({
      createSubscriptionFetch: vi.fn(async () => vi.fn()),
    }));
    vi.doMock("../observability/logger", () => ({
      logger: { info: vi.fn(), warn: vi.fn(), lineInfo: vi.fn(), lineWarn: vi.fn() },
    }));

    const { getAIProvider, _resetProviders } = await import("./ai-gateway");
    _resetProviders();

    const provider = await getAIProvider();
    expect(provider.mode).toBe("openai_subscription");
    expect(() => provider.embeddingModel("openai/text-embedding-3-small")).toThrow(
      "AI_GATEWAY_API_KEY is required for embeddings even in openai_subscription mode",
    );
  });

  it("caches the resolved provider (singleton)", async () => {
    const mockCreateSubscriptionFetch = vi.fn(async () => vi.fn());

    vi.doMock("@zenthor-assist/env/agent", () => ({
      env: {
        AI_PROVIDER_MODE: "openai_subscription",
        AI_GATEWAY_API_KEY: "gw-key",
      },
    }));
    vi.doMock("@ai-sdk/openai", () => ({
      createOpenAI: vi.fn(() => ({
        responses: vi.fn(),
      })),
    }));
    vi.doMock("@ai-sdk/gateway", () => ({
      createGateway: vi.fn(() => {
        const provider = (model: string) => ({ modelId: model });
        provider.embeddingModel = (model: string) => ({ modelId: model });
        return provider;
      }),
    }));
    vi.doMock("./subscription/token-manager", () => ({
      createSubscriptionFetch: mockCreateSubscriptionFetch,
    }));
    vi.doMock("../observability/logger", () => ({
      logger: { info: vi.fn(), warn: vi.fn(), lineInfo: vi.fn(), lineWarn: vi.fn() },
    }));

    const { getAIProvider, _resetProviders } = await import("./ai-gateway");
    _resetProviders();

    const p1 = await getAIProvider();
    const p2 = await getAIProvider();
    expect(p1).toBe(p2);
    // createSubscriptionFetch should only be called once (on first init)
    expect(mockCreateSubscriptionFetch).toHaveBeenCalledOnce();
  });

  it("_resetProviders clears the cached provider", async () => {
    const mockCreateSubscriptionFetch = vi.fn(async () => vi.fn());

    vi.doMock("@zenthor-assist/env/agent", () => ({
      env: {
        AI_PROVIDER_MODE: "openai_subscription",
        AI_GATEWAY_API_KEY: "gw-key",
      },
    }));
    vi.doMock("@ai-sdk/openai", () => ({
      createOpenAI: vi.fn(() => ({
        responses: vi.fn(),
      })),
    }));
    vi.doMock("@ai-sdk/gateway", () => ({
      createGateway: vi.fn(() => {
        const provider = (model: string) => ({ modelId: model });
        provider.embeddingModel = (model: string) => ({ modelId: model });
        return provider;
      }),
    }));
    vi.doMock("./subscription/token-manager", () => ({
      createSubscriptionFetch: mockCreateSubscriptionFetch,
    }));
    vi.doMock("../observability/logger", () => ({
      logger: { info: vi.fn(), warn: vi.fn(), lineInfo: vi.fn(), lineWarn: vi.fn() },
    }));

    const { getAIProvider, _resetProviders } = await import("./ai-gateway");
    _resetProviders();

    const p1 = await getAIProvider();
    _resetProviders();
    const p2 = await getAIProvider();

    expect(p1).not.toBe(p2);
    expect(mockCreateSubscriptionFetch).toHaveBeenCalledTimes(2);
  });
});
