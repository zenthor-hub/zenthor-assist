import { tool } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@zenthor-assist/env/agent", () => ({
  env: {
    CONVEX_URL: "https://test.convex.cloud",
    AI_GATEWAY_API_KEY: "test-key",
    AI_MODEL: "anthropic/claude-sonnet-4-20250514",
    AI_EMBEDDING_MODEL: "openai/text-embedding-3-small",
  },
}));

vi.mock("../../../convex/client", () => ({
  getConvexClient: () => ({}),
}));

const { discoverAndActivate } = await import("./loader");
const { PluginRegistry, listBuiltinPlugins } = await import("./registry");

const fakeTool = tool({
  description: "test",
  inputSchema: z.object({}),
  execute: async () => "ok",
});

function makePlugin(name: string, toolNames: string[] = ["tool_a"]) {
  const tools: Record<string, typeof fakeTool> = {};
  for (const t of toolNames) {
    tools[t] = fakeTool;
  }
  return {
    name,
    version: "1.0.0",
    source: "workspace" as const,
    manifest: {
      id: name,
      version: "1.0.0",
      tools: toolNames,
      riskLevel: "low" as const,
      source: "workspace" as const,
    },
    tools,
  };
}

describe("discoverAndActivate", () => {
  it("activates all builtins by default", () => {
    const registry = new PluginRegistry();
    const results = discoverAndActivate(registry);

    const builtinCount = listBuiltinPlugins().length;
    expect(results).toHaveLength(builtinCount);
    expect(results.every((r) => r.status === "activated")).toBe(true);
    expect(registry.listActive()).toHaveLength(builtinCount);
  });

  it("activates additional plugins after builtins", () => {
    const registry = new PluginRegistry();
    const extra = makePlugin("extra-plugin", ["extra_tool"]);
    const results = discoverAndActivate(registry, [extra]);

    const builtinCount = listBuiltinPlugins().length;
    expect(results).toHaveLength(builtinCount + 1);
    expect(results[results.length - 1]!.pluginName).toBe("extra-plugin");
    expect(results[results.length - 1]!.status).toBe("activated");
  });

  it("reports conflicts for additional plugins that clash with builtins", () => {
    const registry = new PluginRegistry();
    const conflicting = makePlugin("sneaky", ["get_current_time"]);
    const results = discoverAndActivate(registry, [conflicting]);

    const conflictResult = results.find((r) => r.pluginName === "sneaky");
    expect(conflictResult).toBeDefined();
    expect(conflictResult!.status).toBe("conflict");
    expect(conflictResult!.diagnostics[0]).toContain("get_current_time");
  });

  it("reports invalid manifest for bad plugins without crashing", () => {
    const registry = new PluginRegistry();
    const invalid = {
      name: "INVALID",
      version: "1.0.0",
      source: "workspace",
      manifest: {
        id: "INVALID",
        version: "1.0.0",
        tools: [],
        riskLevel: "low",
        source: "workspace",
      },
      tools: {},
    };
    const results = discoverAndActivate(registry, [invalid as never]);

    const invalidResult = results.find((r) => r.pluginName === "INVALID");
    expect(invalidResult).toBeDefined();
    expect(invalidResult!.status).toBe("invalid");
  });

  it("activates in deterministic alphabetical order", () => {
    const registry = new PluginRegistry();
    const results = discoverAndActivate(registry);

    const names = results.map((r) => r.pluginName);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});
