import { startAgentLoop } from "./agent/loop";
import { logger } from "./observability/logger";
import { initSentry } from "./observability/sentry";
import { startWhatsAppCloudRuntime } from "./whatsapp-cloud/runtime";
import { startWhatsAppRuntime } from "./whatsapp/runtime";

/** Env keys that are soft-warned (not fatal) if missing. */
function getRecommendedEnvForRole(role: string): string[] {
  const recommended: string[] = [];
  // AGENT_SECRET is needed by all roles for service mutations in production
  recommended.push("AGENT_SECRET");

  // Audio processing dependencies (relevant when core handles WhatsApp audio)
  if (role === "core" || role === "all") {
    recommended.push("GROQ_API_KEY", "BLOB_READ_WRITE_TOKEN");
  }
  return recommended;
}

function getRequiredEnvForRole(role: string, enableWhatsApp: boolean): string[] {
  const required = ["CONVEX_URL"];

  if (role === "core" || role === "all") {
    required.push("AI_GATEWAY_API_KEY");
  }

  if (enableWhatsApp && role === "whatsapp-cloud") {
    required.push("WHATSAPP_CLOUD_ACCESS_TOKEN", "WHATSAPP_CLOUD_PHONE_NUMBER_ID");
  }

  return required;
}

async function main() {
  initSentry();
  await logger.lineInfo("[main] Starting zenthor-assist agent...");
  void logger.info("agent.starting", {
    role: process.env["AGENT_ROLE"] ?? "all",
    enableWhatsApp: process.env["ENABLE_WHATSAPP"] !== "false",
  });

  const role = (process.env["AGENT_ROLE"] ?? "all").toLowerCase();
  const enableWhatsApp = process.env["ENABLE_WHATSAPP"] !== "false";
  const requiredEnv = getRequiredEnvForRole(role, enableWhatsApp);
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      await logger.lineError(`[main] Missing required env var: ${key}`, { key });
      void logger.error("agent.missing_required_env", { key });
      process.exit(1);
    }
  }

  // Warn about recommended (non-fatal) env vars that may cause runtime degradation
  const recommendedEnv = getRecommendedEnvForRole(role);
  for (const key of recommendedEnv) {
    if (!process.env[key]) {
      await logger.lineWarn(
        `[main] Missing recommended env var: ${key} — some features may be degraded`,
        { key },
      );
      void logger.warn("agent.missing_recommended_env", { key, role });
    }
  }

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
  } else if (role === "whatsapp-cloud") {
    await startWhatsAppCloudRuntime();
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
