import { describe, expect, it } from "vitest";

import {
  getModelCompatibilityErrors,
  getRecommendedEnvForRole,
  getRequiredEnvForRole,
} from "./env-requirements";

// ---------------------------------------------------------------------------
// getRequiredEnvForRole
// ---------------------------------------------------------------------------

describe("getRequiredEnvForRole", () => {
  it("always includes CONVEX_URL regardless of role/mode", () => {
    const roles = [
      "core",
      "all",
      "whatsapp",
      "whatsapp-ingress",
      "whatsapp-egress",
      "whatsapp-cloud",
      "telegram",
    ];
    for (const role of roles) {
      const required = getRequiredEnvForRole(role, false, "gateway");
      expect(required).toContain("CONVEX_URL");
    }
  });

  // Gateway mode

  it("requires AI_GATEWAY_API_KEY for core role in gateway mode", () => {
    const required = getRequiredEnvForRole("core", false, "gateway");
    expect(required).toContain("AI_GATEWAY_API_KEY");
  });

  it("requires AI_GATEWAY_API_KEY for all role in gateway mode", () => {
    const required = getRequiredEnvForRole("all", false, "gateway");
    expect(required).toContain("AI_GATEWAY_API_KEY");
  });

  it("does not require AI_GATEWAY_API_KEY for whatsapp role in gateway mode", () => {
    const required = getRequiredEnvForRole("whatsapp", false, "gateway");
    expect(required).not.toContain("AI_GATEWAY_API_KEY");
  });

  it("does not require AI_GATEWAY_API_KEY for whatsapp-ingress role", () => {
    const required = getRequiredEnvForRole("whatsapp-ingress", false, "gateway");
    expect(required).not.toContain("AI_GATEWAY_API_KEY");
  });

  // Subscription mode (still needs gateway key for embeddings)

  it("requires AI_GATEWAY_API_KEY for core role in subscription mode (for embeddings)", () => {
    const required = getRequiredEnvForRole("core", false, "openai_subscription");
    expect(required).toContain("AI_GATEWAY_API_KEY");
  });

  it("requires AI_GATEWAY_API_KEY for all role in subscription mode (for embeddings)", () => {
    const required = getRequiredEnvForRole("all", false, "openai_subscription");
    expect(required).toContain("AI_GATEWAY_API_KEY");
  });

  it("does not require AI_GATEWAY_API_KEY for whatsapp role in subscription mode", () => {
    const required = getRequiredEnvForRole("whatsapp", false, "openai_subscription");
    expect(required).not.toContain("AI_GATEWAY_API_KEY");
  });

  // WhatsApp Cloud role

  it("requires WhatsApp cloud tokens for whatsapp-cloud role when WhatsApp is enabled", () => {
    const required = getRequiredEnvForRole("whatsapp-cloud", true, "gateway");
    expect(required).toContain("WHATSAPP_CLOUD_ACCESS_TOKEN");
    expect(required).toContain("WHATSAPP_CLOUD_PHONE_NUMBER_ID");
  });

  it("does not require WhatsApp cloud tokens when WhatsApp is disabled", () => {
    const required = getRequiredEnvForRole("whatsapp-cloud", false, "gateway");
    expect(required).not.toContain("WHATSAPP_CLOUD_ACCESS_TOKEN");
    expect(required).not.toContain("WHATSAPP_CLOUD_PHONE_NUMBER_ID");
  });

  it("does not require WhatsApp cloud tokens for core role even when WhatsApp is enabled", () => {
    const required = getRequiredEnvForRole("core", true, "gateway");
    expect(required).not.toContain("WHATSAPP_CLOUD_ACCESS_TOKEN");
  });

  it("requires Telegram bot token for telegram role", () => {
    const required = getRequiredEnvForRole("telegram", false, "gateway");
    expect(required).toContain("TELEGRAM_BOT_TOKEN");
  });

  // No AI key required for non-core roles in subscription mode

  it("only requires CONVEX_URL for whatsapp-egress in subscription mode", () => {
    const required = getRequiredEnvForRole("whatsapp-egress", false, "openai_subscription");
    expect(required).toEqual(["CONVEX_URL"]);
  });
});

// ---------------------------------------------------------------------------
// getRecommendedEnvForRole
// ---------------------------------------------------------------------------

describe("getRecommendedEnvForRole", () => {
  it("always recommends AGENT_SECRET", () => {
    const roles = ["core", "all", "whatsapp", "whatsapp-cloud", "telegram"];
    for (const role of roles) {
      const recommended = getRecommendedEnvForRole(role);
      expect(recommended).toContain("AGENT_SECRET");
    }
  });

  it("recommends GROQ_API_KEY and BLOB_READ_WRITE_TOKEN for core role", () => {
    const recommended = getRecommendedEnvForRole("core");
    expect(recommended).toContain("GROQ_API_KEY");
    expect(recommended).toContain("BLOB_READ_WRITE_TOKEN");
  });

  it("recommends GROQ_API_KEY and BLOB_READ_WRITE_TOKEN for all role", () => {
    const recommended = getRecommendedEnvForRole("all");
    expect(recommended).toContain("GROQ_API_KEY");
    expect(recommended).toContain("BLOB_READ_WRITE_TOKEN");
  });

  it("does not recommend audio deps for whatsapp role", () => {
    const recommended = getRecommendedEnvForRole("whatsapp");
    expect(recommended).not.toContain("GROQ_API_KEY");
    expect(recommended).not.toContain("BLOB_READ_WRITE_TOKEN");
  });

  it("does not recommend audio deps for whatsapp-cloud role", () => {
    const recommended = getRecommendedEnvForRole("whatsapp-cloud");
    expect(recommended).not.toContain("GROQ_API_KEY");
    expect(recommended).not.toContain("BLOB_READ_WRITE_TOKEN");
  });
});

describe("getModelCompatibilityErrors", () => {
  it("returns openai subscription errors for non-openai model ids in core role", () => {
    const errors = getModelCompatibilityErrors("core", "openai_subscription", {
      liteModel: "xai/grok-4.1-fast-reasoning",
      standardModel: "anthropic/claude-sonnet-4-5-20250929",
      fallbackModel: "openai/gpt-5.3-codex",
    });

    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/OpenAI-compatible/);
    expect(errors[1]).toMatch(/OpenAI-compatible/);
  });

  it("skips compatibility checks when provider mode is gateway", () => {
    const errors = getModelCompatibilityErrors("core", "gateway", {
      liteModel: "xai/grok-4.1-fast-reasoning",
      standardModel: "anthropic/claude-sonnet-4-5-20250929",
      fallbackModel: "openai/gpt-5.3-codex",
    });
    expect(errors).toEqual([]);
  });

  it("skips compatibility checks for non-runtime roles", () => {
    const errors = getModelCompatibilityErrors("whatsapp-ingress", "openai_subscription", {
      liteModel: "xai/grok-4.1-fast-reasoning",
      standardModel: "anthropic/claude-sonnet-4-5-20250929",
      fallbackModel: "gpt-5.3-codex",
    });
    expect(errors).toEqual([]);
  });
});
