import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@zenthor-assist/env/agent", () => ({
  env: {
    AI_LITE_MODEL: "xai/grok-4.1-fast-reasoning",
    AI_MODEL: "anthropic/claude-sonnet-4-5-20250929",
    AI_FALLBACK_MODEL: "anthropic/claude-opus-4-6",
  },
}));

vi.mock("../observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

import { getModelCompatibilityError, selectModel } from "./model-router";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("selectModel", () => {
  it("routes simple WhatsApp to grok (lite)", () => {
    const result = selectModel({ channel: "whatsapp", toolCount: 2, messageCount: 3 });
    expect(result.primary).toBe("xai/grok-4.1-fast-reasoning");
    expect(result.tier).toBe("lite");
    expect(result.fallbacks).toEqual([
      "anthropic/claude-sonnet-4-5-20250929",
      "anthropic/claude-opus-4-6",
    ]);
  });

  it("routes simple web to grok (lite) with standard as first fallback", () => {
    const result = selectModel({ channel: "web", toolCount: 2, messageCount: 3 });
    expect(result.primary).toBe("xai/grok-4.1-fast-reasoning");
    expect(result.tier).toBe("lite");
    expect(result.fallbacks).toEqual([
      "anthropic/claude-sonnet-4-5-20250929",
      "anthropic/claude-opus-4-6",
    ]);
  });

  it("stays lite below tool threshold", () => {
    const result = selectModel({ channel: "web", toolCount: 4, messageCount: 5 });
    expect(result.tier).toBe("lite");
  });

  it("escalates to standard at tool threshold (>=5)", () => {
    const result = selectModel({ channel: "web", toolCount: 5, messageCount: 2 });
    expect(result.primary).toBe("anthropic/claude-sonnet-4-5-20250929");
    expect(result.tier).toBe("standard");
  });

  it("escalates web to standard at message threshold (>=15)", () => {
    const result = selectModel({ channel: "web", toolCount: 0, messageCount: 15 });
    expect(result.primary).toBe("anthropic/claude-sonnet-4-5-20250929");
    expect(result.tier).toBe("standard");
  });

  it("keeps WhatsApp on lite even with high message count", () => {
    const result = selectModel({ channel: "whatsapp", toolCount: 0, messageCount: 30 });
    expect(result.primary).toBe("xai/grok-4.1-fast-reasoning");
    expect(result.tier).toBe("lite");
  });

  it("keeps WhatsApp on lite even with high tool count", () => {
    const result = selectModel({ channel: "whatsapp", toolCount: 6, messageCount: 3 });
    expect(result.primary).toBe("xai/grok-4.1-fast-reasoning");
    expect(result.tier).toBe("lite");
    expect(result.fallbacks).toContain("anthropic/claude-sonnet-4-5-20250929");
  });

  it("treats telegram like web complexity rules", () => {
    const result = selectModel({ channel: "telegram", toolCount: 2, messageCount: 3 });
    expect(result.primary).toBe("xai/grok-4.1-fast-reasoning");
    expect(result.tier).toBe("lite");
    expect(result.fallbacks).toContain("anthropic/claude-sonnet-4-5-20250929");
  });

  it("escalates complex web to sonnet (standard)", () => {
    const result = selectModel({ channel: "web", toolCount: 2, messageCount: 20 });
    expect(result.primary).toBe("anthropic/claude-sonnet-4-5-20250929");
    expect(result.tier).toBe("standard");
    expect(result.fallbacks).toEqual(["anthropic/claude-opus-4-6"]);
  });

  it("WhatsApp never escalates regardless of complexity signals", () => {
    const result = selectModel({ channel: "whatsapp", toolCount: 8, messageCount: 25 });
    expect(result.primary).toBe("xai/grok-4.1-fast-reasoning");
    expect(result.tier).toBe("lite");
  });

  it("keeps opus as fallback-only (never primary)", () => {
    const scenarios = [
      { channel: "web" as const, toolCount: 0, messageCount: 1 },
      { channel: "web" as const, toolCount: 10, messageCount: 30 },
      { channel: "whatsapp" as const, toolCount: 0, messageCount: 1 },
      { channel: "whatsapp" as const, toolCount: 10, messageCount: 30 },
      { channel: "telegram" as const, toolCount: 10, messageCount: 30 },
    ];
    for (const ctx of scenarios) {
      const result = selectModel(ctx);
      expect(result.primary).not.toBe("anthropic/claude-opus-4-6");
      expect(result.fallbacks).toContain("anthropic/claude-opus-4-6");
    }
  });

  it("checks provider compatibility for openai_subscription mode", () => {
    expect(() =>
      selectModel({ channel: "web", toolCount: 2, messageCount: 3 }, "openai_subscription"),
    ).toThrow("OpenAI-compatible");
  });
});

describe("model compatibility checks", () => {
  it("accepts openai model IDs when provider is openai_subscription", () => {
    expect(getModelCompatibilityError("openai_subscription", "openai/gpt-5.3-codex")).toBeNull();
    expect(getModelCompatibilityError("openai_subscription", "gpt-5.3-codex")).toBeNull();
  });

  it("rejects non-openai provider prefixes in openai_subscription mode", () => {
    expect(
      getModelCompatibilityError("openai_subscription", "xai/grok-4.1-fast-reasoning"),
    ).toMatch(/OpenAI-compatible model IDs/);
    expect(
      getModelCompatibilityError("openai_subscription", "anthropic/claude-sonnet-4-5-20250929"),
    ).toMatch(/OpenAI-compatible model IDs/);
  });

  it("allows non-openai model IDs for gateway mode", () => {
    expect(getModelCompatibilityError("gateway", "xai/grok-4.1-fast-reasoning")).toBeNull();
    expect(getModelCompatibilityError("gateway", "anthropic/claude-opus-4-6")).toBeNull();
  });
});
