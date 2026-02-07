import * as Sentry from "@sentry/bun";
import { env } from "@zenthor-assist/env/agent";
import {
  getDefaultRuntimeContext,
  redactPayload,
  type TelemetryPayload,
} from "@zenthor-assist/observability";

let sentryInitialized = false;

function resolveRole(): string {
  return (process.env["AGENT_ROLE"] ?? "all").toLowerCase();
}

function resolveServiceName(role: string): string {
  if (role === "core") return "agent-core";
  if (role === "whatsapp" || role === "whatsapp-ingress" || role === "whatsapp-egress") {
    return "agent-whatsapp";
  }
  return "agent";
}

function resolveWorkerRole(role: string): string {
  if (role === "core") return "core";
  if (role === "whatsapp" || role === "whatsapp-ingress" || role === "whatsapp-egress") {
    return "whatsapp";
  }
  return "all";
}

function resolveChannel(role: string): string | undefined {
  if (role === "core") return "web";
  if (role === "whatsapp" || role === "whatsapp-ingress" || role === "whatsapp-egress") {
    return "whatsapp";
  }
  return undefined;
}

function isSentryEnabled(): boolean {
  return env.SENTRY_ENABLED !== false && Boolean(env.SENTRY_DSN);
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : JSON.stringify(error));
}

export function initSentry(): void {
  if (sentryInitialized || !isSentryEnabled()) return;

  const runtimeContext = getDefaultRuntimeContext();
  const role = resolveRole();
  const environment = env.SENTRY_ENVIRONMENT ?? runtimeContext.env;
  const release = env.SENTRY_RELEASE ?? runtimeContext.release;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment,
    release,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE ?? 0,
    sendDefaultPii: false,
  });

  Sentry.setTags({
    app: "agent",
    service: resolveServiceName(role),
    env: environment ?? "unknown",
    role,
    worker_role: resolveWorkerRole(role),
  });

  const channel = resolveChannel(role);
  if (channel) {
    Sentry.setTag("channel", channel);
  }

  if (env.WORKER_ID) {
    Sentry.setTag("worker_id", env.WORKER_ID);
  }

  sentryInitialized = true;
}

export function captureSentryException(
  event: string,
  error: unknown,
  payload?: TelemetryPayload,
): void {
  if (!sentryInitialized) return;

  const safePayload = redactPayload(payload ?? {}, env.OBS_INCLUDE_CONTENT ?? false);

  Sentry.withScope((scope) => {
    scope.setTag("event", event);
    if (Object.keys(safePayload).length > 0) {
      scope.setContext("payload", safePayload as Record<string, unknown>);
    }
    Sentry.captureException(normalizeError(error));
  });
}
