import { describe, expect, it } from "vitest";

import { createManifest } from "./manifest";

describe("createManifest", () => {
  it("returns a valid manifest from input", () => {
    const result = createManifest({
      name: "my-plugin",
      version: "2.0.0",
      tools: ["tool_a", "tool_b"],
    });
    expect(result.name).toBe("my-plugin");
    expect(result.version).toBe("2.0.0");
    expect(result.tools).toEqual(["tool_a", "tool_b"]);
  });

  it("deduplicates tools", () => {
    const result = createManifest({
      name: "dup-plugin",
      version: "1.0.0",
      tools: ["tool_a", "tool_b", "tool_a"],
    });
    expect(result.tools).toEqual(["tool_a", "tool_b"]);
  });

  it("deduplicates capabilities", () => {
    const result = createManifest({
      name: "cap-plugin",
      version: "1.0.0",
      tools: ["t1"],
      capabilities: ["read", "write", "read"],
    });
    expect(result.capabilities).toEqual(["read", "write"]);
  });

  it("deduplicates requiredEnv", () => {
    const result = createManifest({
      name: "env-plugin",
      version: "1.0.0",
      tools: ["t1"],
      requiredEnv: ["KEY_A", "KEY_B", "KEY_A"],
    });
    expect(result.requiredEnv).toEqual(["KEY_A", "KEY_B"]);
  });

  it("handles undefined optional fields", () => {
    const result = createManifest({
      name: "minimal",
      version: "1.0.0",
      tools: ["t1"],
    });
    expect(result.capabilities).toBeUndefined();
    expect(result.requiredEnv).toBeUndefined();
  });

  it("preserves riskLevel", () => {
    const result = createManifest({
      name: "risky",
      version: "1.0.0",
      tools: ["t1"],
      riskLevel: "high",
    });
    expect(result.riskLevel).toBe("high");
  });

  it("preserves tool descriptor metadata", () => {
    const result = createManifest({
      name: "descriptord",
      version: "1.0.0",
      tools: ["task_create"],
      toolDescriptors: {
        task_create: {
          name: "task_create",
          requiresApproval: true,
          outputContract: {
            outputShape: "string",
            requiresStructuredOutput: false,
          },
        },
      },
    });
    expect(result.toolDescriptors?.task_create?.requiresApproval).toBe(true);
  });
});
