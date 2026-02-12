import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { xai } from "@ai-sdk/xai";

import { getProviderMode } from "../ai-gateway";

/**
 * Returns the provider-native web search tool for the given model.
 * Each provider handles search server-side so the model gets results
 * and synthesizes them in a single round-trip.
 */
export function getWebSearchTool(model: string): Record<string, unknown> {
  const mode = getProviderMode();

  const provider = model.split("/")[0];

  // In subscription mode we only support OpenAI-native web search tools.
  // Other providers are not routed through Codex.
  if (mode === "openai_subscription" && provider !== "openai") {
    return {};
  }

  switch (provider) {
    case "anthropic":
      return { web_search: anthropic.tools.webSearch_20250305() };
    case "google":
      return { google_search: google.tools.googleSearch({}) };
    case "openai":
      return { web_search: openai.tools.webSearch() };
    case "xai":
      return { web_search: xai.tools.webSearch() };
    default:
      return {};
  }
}
