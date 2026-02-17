/**
 * Env requirement checks extracted from index.ts for testability.
 * Determines which env vars are required/recommended per role + provider mode.
 */

import type { ProviderMode } from "./agent/ai-gateway";
import { getProviderModelCompatibilityErrors } from "./agent/model-router";

export interface AgentModelConfig {
  liteModel: string;
  standardModel: string;
  fallbackModel?: string;
}

// ---------------------------------------------------------------------------
// Required env vars (fatal if missing)
// ---------------------------------------------------------------------------

export function getRequiredEnvForRole(
  role: string,
  enableWhatsApp: boolean,
  providerMode: ProviderMode,
): string[] {
  const required = ["CONVEX_URL"];

  if (role === "core" || role === "all") {
    if (providerMode === "gateway") {
      required.push("AI_GATEWAY_API_KEY");
    }
    // openai_subscription mode: access token / refresh token / auto-login are
    // validated at runtime by the token manager rather than at boot, because
    // the token might come from the local file cache. We still require the
    // gateway key for embeddings.
    if (providerMode === "openai_subscription") {
      required.push("AI_GATEWAY_API_KEY");
    }
  }

  if (enableWhatsApp && role === "whatsapp-cloud") {
    required.push("WHATSAPP_CLOUD_ACCESS_TOKEN", "WHATSAPP_CLOUD_PHONE_NUMBER_ID");
  }

  if (role === "telegram") {
    required.push("TELEGRAM_BOT_TOKEN");
  }

  return required;
}

// ---------------------------------------------------------------------------
// Recommended env vars (soft-warn if missing)
// ---------------------------------------------------------------------------

export function getRecommendedEnvForRole(role: string): string[] {
  const recommended: string[] = [];
  // AGENT_SECRET is needed by all roles for service mutations in production
  recommended.push("AGENT_SECRET");

  if (role === "telegram") {
    recommended.push("TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_ACCOUNT_ID");
  }

  // Audio processing dependencies (relevant when core handles WhatsApp audio)
  if (role === "core" || role === "all") {
    recommended.push("GROQ_API_KEY", "BLOB_READ_WRITE_TOKEN");
  }
  return recommended;
}

export function getModelCompatibilityErrors(
  role: string,
  providerMode: ProviderMode,
  modelConfig: AgentModelConfig,
): string[] {
  if (role !== "core" && role !== "all") return [];

  return getProviderModelCompatibilityErrors(providerMode, {
    liteModel: modelConfig.liteModel,
    standardModel: modelConfig.standardModel,
    fallbackModel: modelConfig.fallbackModel,
  });
}
