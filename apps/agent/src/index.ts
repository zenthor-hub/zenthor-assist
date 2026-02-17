import { env } from "@zenthor-assist/env/agent";

import { getProviderMode } from "./agent/ai-gateway";
import { startAgentLoop } from "./agent/loop";
import {
  getModelCompatibilityErrors,
  getRecommendedEnvForRole,
  getRequiredEnvForRole,
} from "./env-requirements";
import { logger } from "./observability/logger";
import { initSentry } from "./observability/sentry";
import { startTelegramRuntime } from "./telegram/runtime";
import { startWhatsAppCloudRuntime } from "./whatsapp-cloud/runtime";
import { startWhatsAppRuntime } from "./whatsapp/runtime";

async function main() {
  initSentry();
  await logger.lineInfo("[main] Starting zenthor-assist agent...");

  const role = (process.env["AGENT_ROLE"] ?? "all").toLowerCase();
  const enableWhatsApp = process.env["ENABLE_WHATSAPP"] !== "false";
  const providerMode = getProviderMode();

  void logger.info("agent.starting", {
    role,
    enableWhatsApp,
    providerMode,
  });

  const requiredEnv = getRequiredEnvForRole(role, enableWhatsApp, providerMode);
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

  const modelCompatibilityErrors = getModelCompatibilityErrors(role, providerMode, {
    liteModel: env.AI_LITE_MODEL,
    standardModel: env.AI_MODEL,
    fallbackModel: env.AI_FALLBACK_MODEL,
  });
  if (modelCompatibilityErrors.length > 0) {
    for (const reason of modelCompatibilityErrors) {
      await logger.lineError(`[main] Invalid model configuration: ${reason}`, { reason });
      void logger.error("agent.invalid_model_config", { reason, role, providerMode });
    }
    await logger.lineError("[main] Refusing to start due to AI SDK provider/model incompatibility");
    process.exit(1);
  }

  if (role === "core" || role === "all") {
    startAgentLoop();
  }

  if (role === "telegram") {
    await startTelegramRuntime();
  } else if (!enableWhatsApp) {
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
