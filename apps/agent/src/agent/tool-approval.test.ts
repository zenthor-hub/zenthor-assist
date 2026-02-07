import type { Tool } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@zenthor-assist/env/agent", () => ({
  env: {
    CONVEX_URL: "https://test.convex.cloud",
    AI_GATEWAY_API_KEY: "test-key",
    AI_MODEL: "anthropic/claude-sonnet-4-20250514",
    AI_EMBEDDING_MODEL: "openai/text-embedding-3-small",
  },
}));

vi.mock("../convex/client", () => ({
  getConvexClient: () => ({}),
}));

const { wrapToolsWithApproval } = await import("./tool-approval");
const { getGlobalRegistry } = await import("./plugins/registry");

const makeTool = (name: string): Tool =>
  ({
    description: `Test tool: ${name}`,
    parameters: { type: "object", properties: {} },
    execute: async () => `${name} executed`,
  }) as unknown as Tool;

const baseContext = {
  jobId: "test-job-id",
  conversationId: "test-conversation-id",
  channel: "web" as const,
};

describe("wrapToolsWithApproval", () => {
  afterEach(() => {
    getGlobalRegistry().clear();
  });

  it("returns all tools unchanged when no high-risk plugins are registered", () => {
    const tools: Record<string, Tool> = {
      search: makeTool("search"),
      calculate: makeTool("calculate"),
    };

    const wrapped = wrapToolsWithApproval(tools, baseContext);
    expect(Object.keys(wrapped)).toEqual(["search", "calculate"]);
  });

  it("preserves tool references for non-high-risk tools", () => {
    const tools: Record<string, Tool> = {
      search: makeTool("search"),
    };

    const wrapped = wrapToolsWithApproval(tools, baseContext);
    expect(wrapped["search"]).toBe(tools["search"]);
  });

  it("handles empty tools record", () => {
    const wrapped = wrapToolsWithApproval({}, baseContext);
    expect(Object.keys(wrapped)).toEqual([]);
  });

  it("handles tools without execute function", () => {
    const toolNoExec: Tool = {
      description: "No execute",
      parameters: { type: "object", properties: {} },
    } as unknown as Tool;

    const tools: Record<string, Tool> = {
      passive: toolNoExec,
    };

    const wrapped = wrapToolsWithApproval(tools, baseContext);
    expect(wrapped["passive"]).toBe(toolNoExec);
  });

  it("accepts both web and whatsapp channels", () => {
    const tools: Record<string, Tool> = { t: makeTool("t") };

    const webWrapped = wrapToolsWithApproval(tools, { ...baseContext, channel: "web" });
    expect(Object.keys(webWrapped)).toEqual(["t"]);

    const waWrapped = wrapToolsWithApproval(tools, { ...baseContext, channel: "whatsapp" });
    expect(Object.keys(waWrapped)).toEqual(["t"]);
  });

  it("accepts optional phone in context", () => {
    const tools: Record<string, Tool> = { t: makeTool("t") };
    const wrapped = wrapToolsWithApproval(tools, {
      ...baseContext,
      channel: "whatsapp",
      phone: "5511999999999",
    });
    expect(Object.keys(wrapped)).toEqual(["t"]);
  });

  it("wraps tools from medium-risk plugins with approval", () => {
    const registry = getGlobalRegistry();
    registry.activate({
      name: "risky-plugin",
      version: "1.0.0",
      source: "builtin",
      manifest: {
        id: "risky-plugin",
        version: "1.0.0",
        tools: ["dangerous_action"],
        riskLevel: "medium",
        source: "builtin",
      },
      tools: { dangerous_action: makeTool("dangerous_action") },
    });

    const tools: Record<string, Tool> = {
      safe_tool: makeTool("safe_tool"),
      dangerous_action: makeTool("dangerous_action"),
    };

    const wrapped = wrapToolsWithApproval(tools, baseContext);
    // safe_tool should be the same reference (not wrapped)
    expect(wrapped["safe_tool"]).toBe(tools["safe_tool"]);
    // dangerous_action should be wrapped (different reference)
    expect(wrapped["dangerous_action"]).not.toBe(tools["dangerous_action"]);
  });

  it("wraps tools from high-risk plugins with approval", () => {
    const registry = getGlobalRegistry();
    registry.activate({
      name: "high-risk-plugin",
      version: "1.0.0",
      source: "builtin",
      manifest: {
        id: "high-risk-plugin",
        version: "1.0.0",
        tools: ["delete_data"],
        riskLevel: "high",
        source: "builtin",
      },
      tools: { delete_data: makeTool("delete_data") },
    });

    const tools: Record<string, Tool> = {
      delete_data: makeTool("delete_data"),
    };

    const wrapped = wrapToolsWithApproval(tools, baseContext);
    expect(wrapped["delete_data"]).not.toBe(tools["delete_data"]);
  });

  it("does not wrap tools from low-risk plugins", () => {
    const registry = getGlobalRegistry();
    registry.activate({
      name: "safe-plugin",
      version: "1.0.0",
      source: "builtin",
      manifest: {
        id: "safe-plugin",
        version: "1.0.0",
        tools: ["read_data"],
        riskLevel: "low",
        source: "builtin",
      },
      tools: { read_data: makeTool("read_data") },
    });

    const tools: Record<string, Tool> = {
      read_data: makeTool("read_data"),
    };

    const wrapped = wrapToolsWithApproval(tools, baseContext);
    expect(wrapped["read_data"]).toBe(tools["read_data"]);
  });
});
