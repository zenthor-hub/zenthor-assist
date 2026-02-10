import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { xai } from "@ai-sdk/xai";

import { getProviderMode } from "../ai-gateway";

/**
 * Returns the provider-native web search tool for the given model.
 * Each provider handles search server-side so the model gets results
 * and synthesizes them in a single round-trip.
 *
 * In subscription mode, provider-native web search tools are not
 * compatible with the Codex endpoint, so we return an empty set.
 */
export function getWebSearchTool(model: string): Record<string, unknown> {
  // Subscription mode: no provider-native search tools
  if (getProviderMode() !== "gateway") {
    return {};
  }

  const provider = model.split("/")[0];

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
