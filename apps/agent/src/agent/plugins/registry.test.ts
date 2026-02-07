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

const { PluginRegistry, getPluginToolsByName, listBuiltinPlugins } = await import("./registry");

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
    source: "workspace",
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

describe("listBuiltinPlugins", () => {
  it("returns non-empty list of builtin plugins", () => {
    const plugins = listBuiltinPlugins();
    expect(plugins.length).toBeGreaterThan(0);
  });

  it("each plugin has name, version, source, manifest, and at least one tool", () => {
    for (const plugin of listBuiltinPlugins()) {
      expect(plugin.name).toBeTruthy();
      expect(plugin.version).toBeTruthy();
      expect(plugin.source).toBeTruthy();
      expect(plugin.manifest).toBeDefined();
      expect(plugin.manifest.id).toBe(plugin.name);
      expect(Object.keys(plugin.tools).length).toBeGreaterThan(0);
    }
  });

  it("plugin names are unique", () => {
    const plugins = listBuiltinPlugins();
    const names = plugins.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("getPluginToolsByName", () => {
  it("returns null for unknown plugin (empty global registry)", () => {
    expect(getPluginToolsByName("nonexistent-plugin")).toBeNull();
  });
});

describe("PluginRegistry", () => {
  it("activates a valid plugin", () => {
    const registry = new PluginRegistry();
    const result = registry.activate(makePlugin("test-plugin"));
    expect(result.status).toBe("activated");
    expect(result.diagnostics).toHaveLength(0);
    expect(registry.getActive("test-plugin")).not.toBeNull();
  });

  it("rejects a plugin with invalid manifest", () => {
    const registry = new PluginRegistry();
    const plugin = {
      name: "BAD PLUGIN",
      version: "1.0.0",
      source: "workspace",
      manifest: {
        id: "BAD PLUGIN",
        version: "1.0.0",
        tools: [],
        riskLevel: "low",
        source: "workspace",
      },
      tools: {},
    };
    const result = registry.activate(plugin as never);
    expect(result.status).toBe("invalid");
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("detects tool name conflicts", () => {
    const registry = new PluginRegistry();
    registry.activate(makePlugin("plugin-a", ["shared_tool"]));
    const result = registry.activate(makePlugin("plugin-b", ["shared_tool"]));
    expect(result.status).toBe("conflict");
    expect(result.diagnostics[0]).toContain("shared_tool");
    expect(result.diagnostics[0]).toContain("plugin-a");
  });

  it("allows re-activating the same plugin (idempotent)", () => {
    const registry = new PluginRegistry();
    const plugin = makePlugin("idempotent", ["my_tool"]);
    registry.activate(plugin);
    const result = registry.activate(plugin);
    expect(result.status).toBe("activated");
  });

  it("deactivates a plugin and frees tool names", () => {
    const registry = new PluginRegistry();
    registry.activate(makePlugin("first", ["shared"]));
    expect(registry.deactivate("first")).toBe(true);

    const result = registry.activate(makePlugin("second", ["shared"]));
    expect(result.status).toBe("activated");
  });

  it("deactivate returns false for unknown plugin", () => {
    const registry = new PluginRegistry();
    expect(registry.deactivate("nonexistent")).toBe(false);
  });

  it("listActive returns all activated plugins", () => {
    const registry = new PluginRegistry();
    registry.activate(makePlugin("a"));
    registry.activate(makePlugin("b", ["tool_b"]));
    expect(registry.listActive()).toHaveLength(2);
  });

  it("getAllTools merges tools from all active plugins", () => {
    const registry = new PluginRegistry();
    registry.activate(makePlugin("p1", ["tool_x"]));
    registry.activate(makePlugin("p2", ["tool_y"]));
    const all = registry.getAllTools();
    expect(all).toHaveProperty("tool_x");
    expect(all).toHaveProperty("tool_y");
  });

  it("clear removes all plugins", () => {
    const registry = new PluginRegistry();
    registry.activate(makePlugin("clearable"));
    registry.clear();
    expect(registry.listActive()).toHaveLength(0);
    expect(registry.getActive("clearable")).toBeNull();
  });
});
