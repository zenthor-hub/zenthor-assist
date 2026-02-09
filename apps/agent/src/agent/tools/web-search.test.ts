import { describe, expect, it } from "vitest";

import { getWebSearchTool } from "./web-search";

describe("getWebSearchTool", () => {
  it("returns web_search for anthropic models", () => {
    const tools = getWebSearchTool("anthropic/claude-sonnet-4-5-20250929");
    expect(tools).toHaveProperty("web_search");
    expect(tools).not.toHaveProperty("google_search");
  });

  it("returns google_search for google models", () => {
    const tools = getWebSearchTool("google/gemini-2.5-pro");
    expect(tools).toHaveProperty("google_search");
    expect(tools).not.toHaveProperty("web_search");
  });

  it("returns web_search for openai models", () => {
    const tools = getWebSearchTool("openai/gpt-4o");
    expect(tools).toHaveProperty("web_search");
    expect(tools).not.toHaveProperty("google_search");
  });

  it("returns web_search for xai/grok models", () => {
    const tools = getWebSearchTool("xai/grok-4.1-fast-reasoning");
    expect(tools).toHaveProperty("web_search");
    expect(tools).not.toHaveProperty("google_search");
  });

  it("returns empty object for unsupported providers", () => {
    const tools = getWebSearchTool("mistral/mistral-large");
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it("extracts provider from model string correctly", () => {
    const tools = getWebSearchTool("anthropic/claude-opus-4-6");
    expect(tools).toHaveProperty("web_search");
  });
});
