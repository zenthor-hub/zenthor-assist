import { redactPayload } from "./redact";
import { normalizeSampleRate, shouldSample } from "./sampling";
import type { BaseLogEvent, LogLevel, Logger, LoggerConfig, TelemetryPayload } from "./types";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_ENDPOINT = "https://api.axiom.co/v1";

interface AxiomTransportConfig {
  token?: string;
  dataset?: string;
  endpoint: string;
}

function getComparableLevel(value: LogLevel | undefined): number {
  if (!value) return LEVEL_ORDER["info"];
  return LEVEL_ORDER[value];
}

function buildSampleKey(event: string, payload?: TelemetryPayload): string {
  if (!payload) return event;
  const keys = [
    "conversationId",
    "jobId",
    "messageId",
    "approvalId",
    "accountId",
    "workerId",
    "requestId",
    "traceId",
  ];
  const chunks = [event];
  for (const key of keys) {
    const value = payload[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint"
    ) {
      chunks.push(`${key}:${String(value)}`);
    }
  }
  return chunks.join("|");
}

async function postToAxiom(
  event: BaseLogEvent & TelemetryPayload,
  config: AxiomTransportConfig,
): Promise<void> {
  if (!config.token || !config.dataset) return;

  const endpoint = `${config.endpoint}/datasets/${encodeURIComponent(config.dataset)}/ingest`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([event]),
  });

  if (!response.ok) {
    throw new Error(`Axiom ingest failed with status ${response.status}`);
  }
}

export function createLogger(config: LoggerConfig): Logger {
  const pending = new Set<Promise<void>>();
  const sampleRate = normalizeSampleRate(config.sampleRate);
  const minLevel = getComparableLevel(config.logLevel);
  const endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
  let missingConfigWarningShown = false;

  const emit = async (
    level: LogLevel,
    event: string,
    payload?: TelemetryPayload,
    error?: unknown,
  ): Promise<void> => {
    if (!config.enabled) return;
    if (getComparableLevel(level) < minLevel) return;

    const normalizedPayload: TelemetryPayload = {
      ...config.staticFields,
      ...payload,
    };

    if (error !== undefined) {
      const normalizedError =
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error;
      normalizedPayload["error"] = normalizedError;
    }

    const sampleKey = buildSampleKey(event, normalizedPayload);
    if (!shouldSample(sampleRate, sampleKey)) return;

    const sanitizedPayload = redactPayload(normalizedPayload, config.includeContent ?? false);
    const eventBody: BaseLogEvent & TelemetryPayload = {
      event,
      level,
      service: config.service,
      timestamp: new Date().toISOString(),
      env: config.environment,
      release: config.release,
      ...sanitizedPayload,
    };

    if (!config.token || !config.dataset) {
      if (!missingConfigWarningShown) {
        missingConfigWarningShown = true;
        console.warn(
          `[observability] Missing AXIOM_TOKEN or AXIOM_DATASET for service '${config.service}'.`,
        );
      }
      return;
    }

    const req = postToAxiom(eventBody, {
      token: config.token,
      dataset: config.dataset,
      endpoint,
    }).catch((ingestError) => {
      console.error("[observability] Failed to ingest telemetry event:", ingestError);
    });

    pending.add(req);
    await req;
    pending.delete(req);
  };

  return {
    debug: (event, payload) => emit("debug", event, payload),
    info: (event, payload) => emit("info", event, payload),
    warn: (event, payload) => emit("warn", event, payload),
    error: (event, payload) => emit("error", event, payload),
    exception: (event, error, payload) => emit("error", event, payload, error),
    flush: async () => {
      if (pending.size === 0) return;
      await Promise.allSettled(pending);
    },
  };
}
