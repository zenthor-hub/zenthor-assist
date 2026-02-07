type WebClientLogLevel = "info" | "warn" | "error";

interface ClientLogBody {
  event: string;
  level?: WebClientLogLevel;
  payload?: Record<string, unknown>;
}

export function logWebClientEvent(body: ClientLogBody) {
  void fetch("/api/observability/event", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch(() => {
    // Ignore telemetry transport failures in client UX paths.
  });
}
