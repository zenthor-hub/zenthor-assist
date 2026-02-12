type FailoverReason =
  | "auth"
  | "billing"
  | "rate_limit"
  | "timeout"
  | "server_error"
  | "network"
  | "content_filter"
  | "format"
  | "context_overflow"
  | "unknown";

function extractErrorInfo(err: unknown): { message: string; status?: number } {
  if (typeof err === "string") {
    return { message: err };
  }

  if (err instanceof Error) {
    const obj = err as unknown as Record<string, unknown>;
    const status = obj["status"] as number | undefined;
    const statusCode = obj["statusCode"] as number | undefined;
    return { message: err.message, status: status ?? statusCode };
  }

  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    const message = typeof obj["message"] === "string" ? obj["message"] : String(err);
    const status =
      (obj["status"] as number | undefined) ?? (obj["statusCode"] as number | undefined);
    return { message, status };
  }

  return { message: String(err) };
}

const PATTERNS: Array<{ reason: FailoverReason; regex: RegExp; statuses?: number[] }> = [
  {
    reason: "rate_limit",
    regex: /rate.?limit|too many requests|resource_exhausted|quota exceeded/i,
    statuses: [429],
  },
  {
    reason: "timeout",
    regex: /timeout|timed out|deadline exceeded|ETIMEDOUT/i,
  },
  {
    reason: "auth",
    regex: /invalid api key|unauthorized|forbidden/i,
    statuses: [401, 403],
  },
  {
    reason: "billing",
    regex: /payment required|insufficient credits/i,
    statuses: [402],
  },
  {
    reason: "server_error",
    regex: /internal server error|bad gateway|service unavailable|gateway timeout|overloaded/i,
    statuses: [500, 502, 503, 504],
  },
  {
    reason: "network",
    regex: /ENOTFOUND|ECONNREFUSED|ECONNRESET|EPIPE|EAI_AGAIN|fetch failed|network error/i,
  },
  {
    reason: "content_filter",
    regex: /content filtering|content policy|safety system|blocked by safety/i,
  },
  {
    reason: "format",
    regex: /invalid request|bad request|tool_use\.id/i,
    statuses: [400],
  },
  {
    reason: "context_overflow",
    regex: /context length exceeded|maximum context|too many tokens/i,
  },
];

export function classifyError(err: unknown): FailoverReason {
  const { message, status } = extractErrorInfo(err);

  for (const pattern of PATTERNS) {
    if (pattern.statuses && status !== undefined && pattern.statuses.includes(status)) {
      return pattern.reason;
    }
    if (pattern.regex.test(message)) {
      return pattern.reason;
    }
  }

  return "unknown";
}

export function isRetryable(reason: FailoverReason): boolean {
  return (
    reason === "rate_limit" ||
    reason === "timeout" ||
    reason === "server_error" ||
    reason === "network"
  );
}
