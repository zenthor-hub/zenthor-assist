import { describe, expect, it } from "vitest";

import { pluginManifestSchema, pluginRiskLevelSchema } from "./validators";

describe("pluginRiskLevelSchema", () => {
  it("accepts valid risk levels", () => {
    expect(pluginRiskLevelSchema.parse("low")).toBe("low");
    expect(pluginRiskLevelSchema.parse("medium")).toBe("medium");
    expect(pluginRiskLevelSchema.parse("high")).toBe("high");
  });

  it("rejects invalid risk levels", () => {
    expect(() => pluginRiskLevelSchema.parse("critical")).toThrow();
    expect(() => pluginRiskLevelSchema.parse("")).toThrow();
    expect(() => pluginRiskLevelSchema.parse(42)).toThrow();
  });
});

describe("pluginManifestSchema", () => {
  const validManifest = {
    name: "test-plugin",
    version: "1.0.0",
    tools: ["tool_a", "tool_b"],
  };

  it("accepts a valid minimal manifest", () => {
    const result = pluginManifestSchema.parse(validManifest);
    expect(result.name).toBe("test-plugin");
    expect(result.version).toBe("1.0.0");
    expect(result.tools).toEqual(["tool_a", "tool_b"]);
  });

  it("accepts manifest with all optional fields", () => {
    const full = {
      ...validManifest,
      capabilities: ["read", "write"],
      requiredEnv: ["API_KEY"],
      riskLevel: "high" as const,
      kind: "integration",
      sourceType: "remote",
      channels: ["web", "whatsapp"],
      context: {
        defaultModelTier: "standard",
        workspaceScope: "default",
      },
      policy: { allow: ["note_list"], deny: ["delete_data"], alsoAllow: ["note_create"] },
      toolDescriptors: {
        tool_a: {
          name: "tool_a",
          requiresApproval: false,
          outputContract: {
            outputShape: "json",
            requiredFields: ["action", "status"],
          },
        },
      },
    };
    const result = pluginManifestSchema.parse(full);
    expect(result.capabilities).toEqual(["read", "write"]);
    expect(result.requiredEnv).toEqual(["API_KEY"]);
    expect(result.riskLevel).toBe("high");
    expect(result.kind).toBe("integration");
    expect(result.sourceType).toBe("remote");
    expect(result.channels).toEqual(["web", "whatsapp"]);
    expect(result.policy?.allow).toEqual(["note_list"]);
    expect(result.toolDescriptors?.tool_a?.outputContract?.outputShape).toBe("json");
  });

  it("rejects manifest with empty name", () => {
    expect(() => pluginManifestSchema.parse({ ...validManifest, name: "" })).toThrow();
  });

  it("rejects manifest with empty version", () => {
    expect(() => pluginManifestSchema.parse({ ...validManifest, version: "" })).toThrow();
  });

  it("rejects manifest with empty tools array", () => {
    expect(() => pluginManifestSchema.parse({ ...validManifest, tools: [] })).toThrow();
  });

  it("rejects manifest with empty tool names", () => {
    expect(() => pluginManifestSchema.parse({ ...validManifest, tools: ["valid", ""] })).toThrow();
  });

  it("rejects manifest missing required fields", () => {
    expect(() => pluginManifestSchema.parse({ name: "x" })).toThrow();
    expect(() => pluginManifestSchema.parse({ name: "x", version: "1" })).toThrow();
  });
});
