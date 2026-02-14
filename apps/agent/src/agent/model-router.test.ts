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

import { selectModel } from "./model-router";

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
    ];
    for (const ctx of scenarios) {
      const result = selectModel(ctx);
      expect(result.primary).not.toBe("anthropic/claude-opus-4-6");
      expect(result.fallbacks).toContain("anthropic/claude-opus-4-6");
    }
  });
});
