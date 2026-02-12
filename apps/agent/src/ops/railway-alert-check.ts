import { execFileSync } from "node:child_process";

type Args = {
  environment: string;
  burstWindow: string;
  lookback: string;
  threshold: number;
  lines: number;
};

const DEFAULTS: Args = {
  environment: "development",
  burstWindow: "10m",
  lookback: "24h",
  threshold: 10,
  lines: 2000,
};

const SERVICES = ["agent-whatsapp-cloud", "agent-core"] as const;

function parseArgs(argv: string[]): Args {
  const args = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value) continue;

    if (value === "--environment") {
      args.environment = argv[i + 1] ?? args.environment;
      i += 1;
      continue;
    }

    if (value === "--burst-window") {
      args.burstWindow = argv[i + 1] ?? args.burstWindow;
      i += 1;
      continue;
    }

    if (value === "--lookback") {
      args.lookback = argv[i + 1] ?? args.lookback;
      i += 1;
      continue;
    }

    if (value === "--threshold") {
      const next = Number(argv[i + 1]);
      if (Number.isFinite(next) && next > 0) args.threshold = next;
      i += 1;
      continue;
    }

    if (value === "--lines") {
      const next = Number(argv[i + 1]);
      if (Number.isFinite(next) && next > 0) args.lines = next;
      i += 1;
      continue;
    }
  }

  return args;
}

function runLogs(params: {
  service: string;
  environment: string;
  since: string;
  filter: string;
  lines: number;
}): string {
  try {
    return execFileSync(
      "railway",
      [
        "logs",
        "--service",
        params.service,
        "--environment",
        params.environment,
        "--since",
        params.since,
        "--lines",
        String(params.lines),
        "--filter",
        params.filter,
      ],
      { encoding: "utf8" },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read Railway logs (${params.service}): ${message}`);
  }
}

function countLines(content: string): number {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length;
}

function checkSocketBurst(
  service: string,
  args: Args,
): {
  disconnects: number;
  reconnects: number;
} {
  const disconnects = countLines(
    runLogs({
      service,
      environment: args.environment,
      since: args.burstWindow,
      filter: "WebSocket closed with code 1006",
      lines: args.lines,
    }),
  );

  const reconnects = countLines(
    runLogs({
      service,
      environment: args.environment,
      since: args.burstWindow,
      filter: "WebSocket reconnected",
      lines: args.lines,
    }),
  );

  return { disconnects, reconnects };
}

function checkCriticalSignals(args: Args): {
  leaseHeartbeatLost: number;
  outboundLoopErrors: number;
  sendFailed: number;
} {
  const service = "agent-whatsapp-cloud";

  const leaseHeartbeatLost = countLines(
    runLogs({
      service,
      environment: args.environment,
      since: args.lookback,
      filter: "whatsapp.cloud.lease.heartbeat.lost",
      lines: args.lines,
    }),
  );

  const outboundLoopErrors = countLines(
    runLogs({
      service,
      environment: args.environment,
      since: args.lookback,
      filter: "whatsapp.cloud.outbound.loop.error",
      lines: args.lines,
    }),
  );

  const sendFailed = countLines(
    runLogs({
      service,
      environment: args.environment,
      since: args.lookback,
      filter: "whatsapp.cloud.send.failed",
      lines: args.lines,
    }),
  );

  return { leaseHeartbeatLost, outboundLoopErrors, sendFailed };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  console.info(
    `Checking Railway runtime signals (env=${args.environment}, burst=${args.burstWindow}, lookback=${args.lookback})`,
  );

  let hasAlert = false;

  for (const service of SERVICES) {
    const socket = checkSocketBurst(service, args);
    const burstExceeded = socket.disconnects >= args.threshold;
    const mismatch = socket.disconnects !== socket.reconnects;

    if (burstExceeded || mismatch) hasAlert = true;

    const status = burstExceeded || mismatch ? "ALERT" : "OK";
    console.info(
      `[${status}] ${service}: disconnects=${socket.disconnects}, reconnects=${socket.reconnects} (window ${args.burstWindow}, threshold ${args.threshold})`,
    );
  }

  const critical = checkCriticalSignals(args);
  const criticalCount =
    critical.leaseHeartbeatLost + critical.outboundLoopErrors + critical.sendFailed;

  if (criticalCount > 0) hasAlert = true;

  console.info(
    `[${criticalCount > 0 ? "ALERT" : "OK"}] agent-whatsapp-cloud critical events (window ${args.lookback}): heartbeat_lost=${critical.leaseHeartbeatLost}, outbound_loop_error=${critical.outboundLoopErrors}, send_failed=${critical.sendFailed}`,
  );

  if (hasAlert) {
    console.error("Runtime monitor detected operational alert conditions.");
    process.exit(2);
  }

  console.info("Runtime monitor check passed.");
}

main();
