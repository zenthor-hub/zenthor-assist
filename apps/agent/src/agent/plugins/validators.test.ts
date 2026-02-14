import { describe, expect, it } from "vitest";

import { validateManifest } from "./validators";

describe("validateManifest", () => {
  it("accepts a valid minimal manifest", () => {
    const result = validateManifest({
      id: "my-plugin",
      version: "1.0.0",
      tools: ["do_something"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("my-plugin");
      expect(result.data.riskLevel).toBe("low");
      expect(result.data.source).toBe("workspace");
    }
  });

  it("accepts a fully specified manifest", () => {
    const result = validateManifest({
      id: "full-plugin",
      version: "2.1.0",
      tools: ["tool_a", "tool_b"],
      riskLevel: "high",
      source: "remote",
      channels: ["web", "whatsapp", "telegram"],
      configSchema: { apiKey: { type: "string" } },
      requiredPermissions: ["network"],
      description: "A full plugin",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.riskLevel).toBe("high");
      expect(result.data.channels).toEqual(["web", "whatsapp", "telegram"]);
      expect(result.data.requiredPermissions).toEqual(["network"]);
    }
  });

  it("rejects manifest with missing id", () => {
    const result = validateManifest({
      version: "1.0.0",
      tools: ["tool"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects manifest with empty tools", () => {
    const result = validateManifest({
      id: "empty-tools",
      version: "1.0.0",
      tools: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.message.includes("at least one tool"))).toBe(true);
    }
  });

  it("rejects manifest with invalid id format", () => {
    const result = validateManifest({
      id: "Invalid_Plugin",
      version: "1.0.0",
      tools: ["tool"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.message.includes("lowercase"))).toBe(true);
    }
  });

  it("rejects manifest with invalid risk level", () => {
    const result = validateManifest({
      id: "bad-risk",
      version: "1.0.0",
      tools: ["tool"],
      riskLevel: "critical",
    });
    expect(result.success).toBe(false);
  });

  it("rejects manifest with invalid channel", () => {
    const result = validateManifest({
      id: "bad-channel",
      version: "1.0.0",
      tools: ["tool"],
      channels: ["signal"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects completely invalid input", () => {
    const result = validateManifest("not-an-object");
    expect(result.success).toBe(false);
  });

  it("rejects null input", () => {
    const result = validateManifest(null);
    expect(result.success).toBe(false);
  });
});
