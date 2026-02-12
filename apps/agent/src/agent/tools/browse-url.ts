import { tool } from "ai";
import { convert } from "html-to-text";
import { z } from "zod";

const BLOCKED_PROTOCOLS = ["file:", "data:", "javascript:", "blob:"];
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_OUTPUT_CHARS = 100_000;
const TIMEOUT_MS = 15_000;

function isBlockedProtocol(url: string): boolean {
  const lower = url.toLowerCase().trim();
  return BLOCKED_PROTOCOLS.some((p) => lower.startsWith(p));
}

function isBinaryContentType(ct: string): boolean {
  const binary = [
    "image/",
    "audio/",
    "video/",
    "application/pdf",
    "application/zip",
    "application/octet-stream",
  ];
  return binary.some((b) => ct.includes(b));
}

export const browseUrl = tool({
  description:
    "Fetch and extract readable text content from a URL. Useful for reading web pages, articles, documentation, etc. Returns the text content stripped of HTML tags and navigation elements.",
  inputSchema: z.object({
    url: z.string().describe("The URL to fetch and extract text from"),
  }),
  execute: async ({ url }) => {
    // SSRF prevention
    if (isBlockedProtocol(url)) {
      return `Error: Protocol not allowed. Blocked protocols: ${BLOCKED_PROTOCOLS.join(", ")}`;
    }

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "User-Agent": "ZenthorAssist/1.0 (compatible; bot)",
          Accept: "text/html, application/xhtml+xml, text/plain, */*;q=0.8",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        return `Error: HTTP ${response.status} ${response.statusText}`;
      }

      const contentType = response.headers.get("content-type") ?? "";

      if (isBinaryContentType(contentType)) {
        return `Error: Cannot extract text from binary content (${contentType})`;
      }

      // Check content-length if available
      const contentLength = response.headers.get("content-length");
      if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
        return `Error: Response too large (${contentLength} bytes, max ${MAX_RESPONSE_BYTES})`;
      }

      const html = await response.text();

      if (html.length > MAX_RESPONSE_BYTES) {
        return `Error: Response body too large (${html.length} bytes, max ${MAX_RESPONSE_BYTES})`;
      }

      // Plain text responses
      if (contentType.includes("text/plain") || contentType.includes("application/json")) {
        const text = html.slice(0, MAX_OUTPUT_CHARS);
        return text.length < html.length
          ? `${text}\n\n[Truncated — ${html.length} chars total]`
          : text;
      }

      // HTML → text
      const text = convert(html, {
        wordwrap: 120,
        selectors: [
          { selector: "nav", format: "skip" },
          { selector: "header", format: "skip" },
          { selector: "footer", format: "skip" },
          { selector: "script", format: "skip" },
          { selector: "style", format: "skip" },
          { selector: "img", format: "skip" },
          { selector: "a", options: { ignoreHref: true } },
        ],
      });

      const trimmed = text.slice(0, MAX_OUTPUT_CHARS);
      return trimmed.length < text.length
        ? `${trimmed}\n\n[Truncated — ${text.length} chars total]`
        : trimmed || "No readable text content found on the page.";
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        return `Error: Request timed out after ${TIMEOUT_MS / 1000}s`;
      }
      return `Error fetching URL: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
