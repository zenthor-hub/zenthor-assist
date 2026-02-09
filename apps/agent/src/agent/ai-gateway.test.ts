import { afterEach, describe, expect, it, vi } from "vitest";

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
