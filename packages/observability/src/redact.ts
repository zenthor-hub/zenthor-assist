const REDACTED = "[redacted]";
const MAX_DEPTH = 6;
const MAX_ARRAY_LENGTH = 50;
const MAX_STRING_LENGTH = 2000;

const CONTENT_KEYS = new Set([
  "content",
  "text",
  "body",
  "message",
  "prompt",
  "response",
  "toolinput",
  "tooloutput",
  "input",
  "output",
  "stack",
]);

interface RedactionOptions {
  includeContent: boolean;
}

function redactString(value: string, key: string | undefined, options: RedactionOptions): string {
  const normalizedKey = (key ?? "").toLowerCase();
  if (!options.includeContent && CONTENT_KEYS.has(normalizedKey)) {
    return REDACTED;
  }

  const maskedEmails = value.replace(
    /\b([A-Za-z0-9._%+-]{1,64})@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    (_, local: string, domain: string) => {
      const prefix = local.length <= 2 ? "*" : `${local.slice(0, 2)}***`;
      return `${prefix}@${domain}`;
    },
  );

  const maskedPhones = maskedEmails.replace(
    /\+?\d[\d().\-\s]{6,}\d/g,
    (raw: string) => `${raw.slice(0, 2)}***${raw.slice(-2)}`,
  );

  if (maskedPhones.length <= MAX_STRING_LENGTH) return maskedPhones;
  return `${maskedPhones.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

function redactValue(
  value: unknown,
  key: string | undefined,
  options: RedactionOptions,
  depth: number,
): unknown {
  if (depth > MAX_DEPTH) return "[max-depth]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return redactString(value, key, options);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return value;
  }

  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message, "message", options),
      stack: options.includeContent ? value.stack : REDACTED,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => redactValue(item, key, options, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(v, k, options, depth + 1);
    }
    return out;
  }

  return String(value);
}

export function redactPayload(payload: Record<string, unknown>, includeContent: boolean) {
  const options: RedactionOptions = { includeContent };
  return redactValue(payload, undefined, options, 0) as Record<string, unknown>;
}
