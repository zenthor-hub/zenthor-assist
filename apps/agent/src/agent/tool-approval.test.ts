import type { Tool } from "ai";
import { describe, expect, it, vi } from "vitest";

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
  it("returns all tools when HIGH_RISK_TOOLS is empty", () => {
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
});
