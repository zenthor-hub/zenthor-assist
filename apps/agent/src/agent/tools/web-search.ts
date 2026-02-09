import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { xai } from "@ai-sdk/xai";

/**
 * Returns the provider-native web search tool for the given model.
 * Each provider handles search server-side so the model gets results
 * and synthesizes them in a single round-trip.
 */
export function getWebSearchTool(model: string): Record<string, unknown> {
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
