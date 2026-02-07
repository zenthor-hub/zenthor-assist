import { describe, expect, it } from "vitest";

import { serializeManifest } from "./manifest";
import { validateManifest } from "./validators";

describe("validateManifest", () => {
  it("normalizes a minimal input with defaults", () => {
    const result = validateManifest({
      id: "test-plugin",
      version: "1.0.0",
      tools: ["tool_a"],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.id).toBe("test-plugin");
    expect(result.data.riskLevel).toBe("low");
    expect(result.data.source).toBe("workspace");
    expect(result.data.tools).toEqual(["tool_a"]);
  });

  it("preserves explicit values without overriding", () => {
    const result = validateManifest({
      id: "custom",
      version: "2.0.0",
      tools: ["x"],
      riskLevel: "high",
      source: "remote",
      description: "Custom plugin",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.riskLevel).toBe("high");
    expect(result.data.source).toBe("remote");
    expect(result.data.description).toBe("Custom plugin");
  });

  it("returns failure for invalid input", () => {
    const result = validateManifest({ id: "BAD ID", tools: [] });
    expect(result.success).toBe(false);
  });

  it("returns failure for missing required fields", () => {
    const result = validateManifest({});
    expect(result.success).toBe(false);
  });

  it("produces deterministic output for same input", () => {
    const input = { id: "deterministic", version: "1.0.0", tools: ["a", "b"] };
    const first = validateManifest(input);
    const second = validateManifest(input);
    expect(first).toEqual(second);
  });
});

describe("serializeManifest", () => {
  it("returns a plain object suitable for Convex storage", () => {
    const result = validateManifest({
      id: "serialize-test",
      version: "1.0.0",
      tools: ["tool"],
      riskLevel: "medium",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const serialized = serializeManifest(result.data);
    expect(serialized.id).toBe("serialize-test");
    expect(serialized.riskLevel).toBe("medium");
    expect(serialized.tools).toEqual(["tool"]);
  });
});
