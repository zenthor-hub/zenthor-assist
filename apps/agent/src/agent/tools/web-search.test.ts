import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Gateway mode tests (default)
// ---------------------------------------------------------------------------

describe("getWebSearchTool (gateway mode)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns web_search for anthropic models", async () => {
    vi.doMock("../ai-gateway", () => ({ getProviderMode: () => "gateway" }));
    const { getWebSearchTool } = await import("./web-search");
    const tools = getWebSearchTool("anthropic/claude-sonnet-4-5-20250929");
    expect(tools).toHaveProperty("web_search");
    expect(tools).not.toHaveProperty("google_search");
  });

  it("returns google_search for google models", async () => {
    vi.doMock("../ai-gateway", () => ({ getProviderMode: () => "gateway" }));
    const { getWebSearchTool } = await import("./web-search");
    const tools = getWebSearchTool("google/gemini-2.5-pro");
    expect(tools).toHaveProperty("google_search");
    expect(tools).not.toHaveProperty("web_search");
  });

  it("returns web_search for openai models", async () => {
    vi.doMock("../ai-gateway", () => ({ getProviderMode: () => "gateway" }));
    const { getWebSearchTool } = await import("./web-search");
    const tools = getWebSearchTool("openai/gpt-4o");
    expect(tools).toHaveProperty("web_search");
    expect(tools).not.toHaveProperty("google_search");
  });

  it("returns web_search for xai/grok models", async () => {
    vi.doMock("../ai-gateway", () => ({ getProviderMode: () => "gateway" }));
    const { getWebSearchTool } = await import("./web-search");
    const tools = getWebSearchTool("xai/grok-4.1-fast-reasoning");
    expect(tools).toHaveProperty("web_search");
    expect(tools).not.toHaveProperty("google_search");
  });

  it("returns empty object for unsupported providers", async () => {
    vi.doMock("../ai-gateway", () => ({ getProviderMode: () => "gateway" }));
    const { getWebSearchTool } = await import("./web-search");
    const tools = getWebSearchTool("mistral/mistral-large");
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it("extracts provider from model string correctly", async () => {
    vi.doMock("../ai-gateway", () => ({ getProviderMode: () => "gateway" }));
    const { getWebSearchTool } = await import("./web-search");
    const tools = getWebSearchTool("anthropic/claude-opus-4-6");
    expect(tools).toHaveProperty("web_search");
  });
});

// ---------------------------------------------------------------------------
// Subscription mode tests
// ---------------------------------------------------------------------------

describe("getWebSearchTool (subscription mode)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns empty object in subscription mode regardless of provider", async () => {
    vi.doMock("../ai-gateway", () => ({ getProviderMode: () => "openai_subscription" }));
    const { getWebSearchTool } = await import("./web-search");

    expect(Object.keys(getWebSearchTool("anthropic/claude-sonnet-4-5-20250929"))).toHaveLength(0);
    expect(Object.keys(getWebSearchTool("openai/gpt-4o"))).toHaveLength(0);
    expect(Object.keys(getWebSearchTool("xai/grok-4.1-fast-reasoning"))).toHaveLength(0);
    expect(Object.keys(getWebSearchTool("google/gemini-2.5-pro"))).toHaveLength(0);
  });
});
