import { lookup } from "node:dns/promises";

import { tool } from "ai";
import { convert } from "html-to-text";
import { z } from "zod";

import {
  isDisallowedHostname,
  isPrivateIpAddress,
  matchesHostnameAllowlist,
  resolveUrlAllowlist,
} from "./url-guard";

const ALLOWED_PROTOCOLS = ["http:", "https:"] as const;
const ALLOWED_PORTS = new Set([80, 443]);
const MAX_PORT = 65_535;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_OUTPUT_CHARS = 100_000;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const inputSchema = z.object({
  url: z.string().describe("The URL to fetch and extract text from"),
});
type BrowseUrlInput = z.infer<typeof inputSchema>;

function getConfiguredUrlAllowlist(): string[] {
  return resolveUrlAllowlist(process.env.WEB_TOOL_URL_ALLOWLIST) ?? [];
}

function isBlockedPort(port: number, protocol: string): boolean {
  if (!ALLOWED_PORTS.has(port)) return true;

  if (port > MAX_PORT || port <= 0) return true;
  if (protocol === "https:" && port !== 443) return true;
  if (protocol === "http:" && port !== 80) return true;
  return false;
}

async function isPrivateOrBlockedTarget(
  rawUrl: string,
  urlAllowlist: string[],
): Promise<string | undefined> {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return "Error: Invalid URL format.";
  }

  if (!ALLOWED_PROTOCOLS.includes(url.protocol as (typeof ALLOWED_PROTOCOLS)[number])) {
    return `Error: Protocol not allowed. Blocked protocols: file:, data:, javascript:, blob:.`;
  }

  const hostname =
    url.hostname.startsWith("[") && url.hostname.endsWith("]")
      ? url.hostname.slice(1, -1)
      : url.hostname;
  const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80;

  if (isNaN(port) || isBlockedPort(port, url.protocol)) {
    return "Error: Port not allowed. Use http/https on ports 80 or 443 only.";
  }

  if (urlAllowlist.length > 0 && !matchesHostnameAllowlist(hostname, urlAllowlist)) {
    return `Error: URL not allowed by policy. Allowed domains: ${urlAllowlist.join(", ")}`;
  }

  if (isDisallowedHostname(hostname)) {
    return "Error: Hostname is blocked for security reasons.";
  }

  if (isPrivateIpAddress(hostname)) {
    return "Error: Direct IP address target is blocked.";
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.length === 0) {
      return "Error: Hostname did not resolve to any addresses.";
    }

    const blocked = addresses.some((record) => isPrivateIpAddress(record.address));
    if (blocked) {
      return "Error: Hostname resolves to blocked/private IP range.";
    }
  } catch {
    return "Error: Hostname resolution failed or is blocked.";
  }

  return undefined;
}

async function fetchWithRedirectGuard(
  rawUrl: string,
  requestConfig: RequestInit,
  urlAllowlist: string[],
): Promise<Response> {
  let currentUrl = rawUrl;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const blocked = await isPrivateOrBlockedTarget(currentUrl, urlAllowlist);
    if (blocked) {
      throw new Error(blocked);
    }

    const response = await fetch(currentUrl, requestConfig);
    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    const resolvedLocation = new URL(location, currentUrl).toString();
    if (redirects === MAX_REDIRECTS) {
      throw new Error("Error: Too many redirect hops while fetching URL.");
    }

    currentUrl = resolvedLocation;
  }

  throw new Error("Error: Too many redirect hops while fetching URL.");
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

export async function executeBrowseUrl(input: BrowseUrlInput): Promise<string> {
  const configuredAllowlist = getConfiguredUrlAllowlist();

  const validationError = await isPrivateOrBlockedTarget(input.url, configuredAllowlist);
  if (validationError) {
    return validationError;
  }

  const fetchConfig: RequestInit = {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "User-Agent": "ZenthorAssist/1.0 (compatible; bot)",
      Accept: "text/html, application/xhtml+xml, text/plain, */*;q=0.8",
    },
    redirect: "manual",
  };

  try {
    const response = await fetchWithRedirectGuard(input.url, fetchConfig, configuredAllowlist);

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
}

export const browseUrl = tool({
  description:
    "Fetch and extract readable text content from a URL. Useful for reading web pages, articles, documentation, etc. Returns the text content stripped of HTML tags and navigation elements.",
  inputSchema,
  execute: async (input) => executeBrowseUrl(input),
});
