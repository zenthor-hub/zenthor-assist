import { startAgentLoop } from "./agent/loop";
import { logger } from "./observability/logger";
import { initSentry } from "./observability/sentry";
import { startWhatsAppRuntime } from "./whatsapp/runtime";

async function main() {
  initSentry();
  await logger.lineInfo("[main] Starting zenthor-assist agent...");
  void logger.info("agent.starting", {
    role: process.env["AGENT_ROLE"] ?? "all",
    enableWhatsApp: process.env["ENABLE_WHATSAPP"] !== "false",
  });

  const requiredEnv = ["CONVEX_URL", "AI_GATEWAY_API_KEY"];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      await logger.lineError(`[main] Missing required env var: ${key}`, { key });
      void logger.error("agent.missing_required_env", { key });
      process.exit(1);
    }
  }

  const role = (process.env["AGENT_ROLE"] ?? "all").toLowerCase();
  const enableWhatsApp = process.env["ENABLE_WHATSAPP"] !== "false";

  if (role === "core" || role === "all") {
    startAgentLoop();
  }

  if (!enableWhatsApp) {
    await logger.lineInfo("[main] WhatsApp disabled via ENABLE_WHATSAPP=false");
    void logger.info("agent.whatsapp.disabled", { role });
  } else if (role === "whatsapp" || role === "all") {
    await startWhatsAppRuntime({ enableIngress: true, enableEgress: true });
  } else if (role === "whatsapp-ingress") {
    await startWhatsAppRuntime({ enableIngress: true, enableEgress: false });
  } else if (role === "whatsapp-egress") {
    await startWhatsAppRuntime({ enableIngress: false, enableEgress: true });
  }

  await logger.lineInfo(`[main] Agent is running (role: ${role})`, { role, enableWhatsApp });
  await logger.info("agent.ready", { role, enableWhatsApp });
}

main().catch((error) => {
  void logger.lineError("[main] Fatal error", {
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : String(error),
  });
  void logger.exception("agent.fatal", error, {
    role: process.env["AGENT_ROLE"] ?? "all",
  });
  process.exit(1);
});
