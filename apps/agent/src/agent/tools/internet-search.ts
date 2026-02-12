import { env } from "@zenthor-assist/env/agent";
import { tool } from "ai";
import { z } from "zod";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RESULTS = 5;

const tavilyResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string().optional(),
  score: z.number().optional(),
});

const tavilyResponseSchema = z.object({
  results: z.array(tavilyResultSchema),
});

function getTavilyApiKey(): string | null {
  const value = env.TAVILY_API_KEY?.trim();
  if (!value) return null;
  return value;
}

export const internetSearch = tool({
  description:
    "Search the internet for recent or factual information and return ranked source results. Use this for current events, latest updates, fact-checking, and finding relevant URLs before reading pages with browse_url.",
  inputSchema: z.object({
    query: z.string().describe("Natural-language search query to run on the public web"),
    maxResults: z
      .number()
      .optional()
      .describe("Maximum number of results to return (1-10, default 5)"),
  }),
  execute: async ({ query, maxResults }) => {
    if (env.WEB_SEARCH_PROVIDER !== "tavily") {
      return {
        error: `Unsupported WEB_SEARCH_PROVIDER: ${env.WEB_SEARCH_PROVIDER}`,
        provider: env.WEB_SEARCH_PROVIDER,
        results: [],
      };
    }

    const apiKey = getTavilyApiKey();
    if (!apiKey) {
      return {
        error: "Internet search is not configured. Set TAVILY_API_KEY in the agent environment.",
        provider: "tavily",
        results: [],
      };
    }

    try {
      const response = await fetch(TAVILY_SEARCH_URL, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: maxResults ?? DEFAULT_MAX_RESULTS,
          search_depth: "basic",
          include_answer: false,
          include_images: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return {
          error: `Search request failed with HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 300)}` : ""}`,
          provider: "tavily",
          results: [],
        };
      }

      const json = await response.json();
      const parsed = tavilyResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          error: "Search provider returned an unexpected response format.",
          provider: "tavily",
          results: [],
        };
      }

      const normalized = parsed.data.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content ?? "",
        score: r.score ?? null,
      }));

      return {
        provider: "tavily",
        query,
        resultCount: normalized.length,
        results: normalized,
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        return {
          error: `Search request timed out after ${TIMEOUT_MS / 1000}s`,
          provider: "tavily",
          results: [],
        };
      }

      return {
        error: `Search request failed: ${err instanceof Error ? err.message : String(err)}`,
        provider: "tavily",
        results: [],
      };
    }
  },
});
