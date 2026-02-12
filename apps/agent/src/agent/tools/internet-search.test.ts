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
  vi.doMock("@zenthor-assist/env/agent", () => ({
    env: {
      WEB_SEARCH_PROVIDER: "tavily",
      TAVILY_API_KEY: undefined,
      ...envOverrides,
    },
  }));

  const { internetSearch } = await import("./internet-search");
  const executor = internetSearch as unknown as InternetSearchExecutor;
  return executor.execute(input);
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
