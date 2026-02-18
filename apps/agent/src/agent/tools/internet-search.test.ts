import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type InternetSearchExecutor = {
  execute: (input: { query: string; maxResults?: number }) => Promise<unknown>;
};

const mockFetch = vi.fn<typeof globalThis.fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  mockFetch.mockReset();
});

async function runWithEnv(
  envOverrides: Record<string, unknown>,
  input: { query: string; maxResults?: number },
): Promise<unknown> {
  const originalAllowlist = process.env.WEB_TOOL_URL_ALLOWLIST;
  if (envOverrides.WEB_TOOL_URL_ALLOWLIST === undefined) {
    delete process.env.WEB_TOOL_URL_ALLOWLIST;
  } else if (typeof envOverrides.WEB_TOOL_URL_ALLOWLIST === "string") {
    process.env.WEB_TOOL_URL_ALLOWLIST = envOverrides.WEB_TOOL_URL_ALLOWLIST;
  }

  vi.doMock("@zenthor-assist/env/agent", () => ({
    env: {
      WEB_SEARCH_PROVIDER: "tavily",
      TAVILY_API_KEY: undefined,
      ...envOverrides,
    },
  }));

  const { internetSearch } = await import("./internet-search");
  const executor = internetSearch as unknown as InternetSearchExecutor;
  try {
    return await executor.execute(input);
  } finally {
    if (originalAllowlist === undefined) {
      delete process.env.WEB_TOOL_URL_ALLOWLIST;
    } else {
      process.env.WEB_TOOL_URL_ALLOWLIST = originalAllowlist;
    }
  }
}

describe("internetSearch", () => {
  it("returns configuration error when TAVILY_API_KEY is missing", async () => {
    const result = (await runWithEnv({}, { query: "latest ai news" })) as {
      error?: string;
    };
    expect(result.error).toContain("TAVILY_API_KEY");
  });

  it("returns search results for successful Tavily response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              title: "Example",
              url: "https://example.com",
              content: "Example snippet",
              score: 0.98,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = (await runWithEnv(
      { TAVILY_API_KEY: "test-key" },
      { query: "latest ai news", maxResults: 3 },
    )) as {
      provider: string;
      query: string;
      resultCount: number;
      results: Array<{ title: string; url: string; snippet: string; score: number | null }>;
    };

    expect(result.provider).toBe("tavily");
    expect(result.query).toBe("latest ai news");
    expect(result.resultCount).toBe(1);
    expect(result.results[0]?.title).toBe("Example");
    expect(result.results[0]?.url).toBe("https://example.com");
    expect(result.results[0]?.snippet).toBe("Example snippet");
    expect(result.results[0]?.score).toBe(0.98);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("filters results with configured URL allowlist", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              title: "Example",
              url: "https://example.com",
              content: "Example snippet",
              score: 0.98,
            },
            {
              title: "Docs",
              url: "https://docs.openclaw.ai/guide",
              content: "Guide",
              score: 0.5,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = (await runWithEnv(
      { TAVILY_API_KEY: "test-key", WEB_TOOL_URL_ALLOWLIST: "docs.openclaw.ai" },
      { query: "latest ai news", maxResults: 3 },
    )) as {
      provider: string;
      resultCount: number;
      results: Array<{ title: string; url: string; snippet: string; score: number | null }>;
    };

    expect(result.provider).toBe("tavily");
    expect(result.resultCount).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.url).toBe("https://docs.openclaw.ai/guide");
  });

  it("supports wildcard allowlist patterns", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              title: "Blog",
              url: "https://chat.openclaw.ai/weekly",
              content: "news",
              score: 0.91,
            },
            {
              title: "Root",
              url: "https://openclaw.ai",
              content: "homepage",
              score: 0.77,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = (await runWithEnv(
      { TAVILY_API_KEY: "test-key", WEB_TOOL_URL_ALLOWLIST: "*.openclaw.ai" },
      { query: "openclaw updates", maxResults: 2 },
    )) as {
      resultCount: number;
      results: Array<{ title: string; url: string; snippet: string; score: number | null }>;
    };

    expect(result.resultCount).toBe(1);
    expect(result.results[0]?.url).toBe("https://chat.openclaw.ai/weekly");
  });

  it("returns provider error on non-200 response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Bad Request", {
        status: 400,
        headers: { "content-type": "text/plain" },
      }),
    );

    const result = (await runWithEnv(
      { TAVILY_API_KEY: "test-key" },
      { query: "latest ai news" },
    )) as {
      error?: string;
    };

    expect(result.error).toContain("HTTP 400");
  });

  it("returns timeout error when request exceeds timeout", async () => {
    const timeoutError = new DOMException("timed out", "TimeoutError");
    mockFetch.mockRejectedValueOnce(timeoutError);

    const result = (await runWithEnv(
      { TAVILY_API_KEY: "test-key" },
      { query: "latest ai news" },
    )) as {
      error?: string;
    };

    expect(result.error).toContain("timed out");
  });

  it("returns unsupported provider error for non-tavily provider", async () => {
    const result = (await runWithEnv(
      { WEB_SEARCH_PROVIDER: "custom", TAVILY_API_KEY: "test-key" },
      { query: "latest ai news" },
    )) as {
      error?: string;
    };

    expect(result.error).toContain("Unsupported WEB_SEARCH_PROVIDER");
  });
});
