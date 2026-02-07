import { describe, expect, it, vi } from "vitest";

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

const { getPluginToolsByName, listBuiltinPlugins } = await import("./registry");

describe("listBuiltinPlugins", () => {
  it("returns non-empty list of builtin plugins", () => {
    const plugins = listBuiltinPlugins();
    expect(plugins.length).toBeGreaterThan(0);
  });

  it("each plugin has name, version, source, and at least one tool", () => {
    for (const plugin of listBuiltinPlugins()) {
      expect(plugin.name).toBeTruthy();
      expect(plugin.version).toBeTruthy();
      expect(plugin.source).toBeTruthy();
      expect(Object.keys(plugin.tools).length).toBeGreaterThan(0);
    }
  });

  it("includes core-time plugin with get_current_time tool", () => {
    const plugins = listBuiltinPlugins();
    const timePlugin = plugins.find((p) => p.name === "core-time");
    expect(timePlugin).toBeDefined();
    expect(timePlugin!.tools).toHaveProperty("get_current_time");
  });

  it("includes core-memory plugin with memory tools", () => {
    const plugins = listBuiltinPlugins();
    const memoryPlugin = plugins.find((p) => p.name === "core-memory");
    expect(memoryPlugin).toBeDefined();
    expect(memoryPlugin!.tools).toHaveProperty("memory_search");
    expect(memoryPlugin!.tools).toHaveProperty("memory_store");
  });

  it("includes core-schedule plugin with schedule_task tool", () => {
    const plugins = listBuiltinPlugins();
    const schedulePlugin = plugins.find((p) => p.name === "core-schedule");
    expect(schedulePlugin).toBeDefined();
    expect(schedulePlugin!.tools).toHaveProperty("schedule_task");
  });

  it("plugin names are unique", () => {
    const plugins = listBuiltinPlugins();
    const names = plugins.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("getPluginToolsByName", () => {
  it("returns tools for a known plugin", () => {
    const tools = getPluginToolsByName("core-time");
    expect(tools).not.toBeNull();
    expect(tools).toHaveProperty("get_current_time");
  });

  it("returns null for unknown plugin", () => {
    expect(getPluginToolsByName("nonexistent-plugin")).toBeNull();
  });

  it("returns all tools listed in the plugin", () => {
    for (const plugin of listBuiltinPlugins()) {
      const tools = getPluginToolsByName(plugin.name);
      expect(tools).not.toBeNull();
      for (const toolName of Object.keys(plugin.tools)) {
        expect(tools).toHaveProperty(toolName);
      }
    }
  });
});
