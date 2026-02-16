import { z } from "zod";

const envSchema = z.object({
  CONVEX_URL: z.url(),
  AI_PROVIDER_MODE: z.enum(["gateway", "openai_subscription"]).optional().default("gateway"),
  AI_GATEWAY_API_KEY: z.string().min(1).optional(),
  AI_LITE_MODEL: z.string().default("xai/grok-4.1-fast-reasoning"),
  AI_MODEL: z.string().default("anthropic/claude-sonnet-4-5-20250929"),
  AI_FALLBACK_MODEL: z.string().optional(),
  AI_CONTEXT_WINDOW: z.coerce.number().optional(),
  AI_EMBEDDING_MODEL: z.string().default("openai/text-embedding-3-small"),
  WEB_SEARCH_PROVIDER: z.enum(["tavily"]).optional().default("tavily"),
  TAVILY_API_KEY: z.string().min(1).optional(),
  // OpenAI subscription mode (personal ChatGPT Plus/Pro via Codex endpoint)
  AI_SUBSCRIPTION_BASE_URL: z
    .string()
    .min(1)
    .optional()
    .default("https://chatgpt.com/backend-api/codex"),
  AI_SUBSCRIPTION_CLIENT_ID: z.string().min(1).optional().default("app_EMoamEEZ73f0CkXaXp7hrann"),
  AI_SUBSCRIPTION_ACCESS_TOKEN: z.string().min(1).optional(),
  AI_SUBSCRIPTION_REFRESH_TOKEN: z.string().min(1).optional(),
  AI_SUBSCRIPTION_EXPIRES_AT: z.coerce.number().optional(),
  AI_SUBSCRIPTION_ACCOUNT_ID: z.string().min(1).optional(),
  AI_SUBSCRIPTION_AUTH_METHOD: z.enum(["browser", "device"]).optional().default("device"),
  AI_SUBSCRIPTION_OAUTH_PORT: z.coerce.number().optional().default(1455),
  AI_SUBSCRIPTION_AUTO_LOGIN: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  AGENT_SECRET: z.string().min(1).optional(),
  ZENTHOR_FINANCE_API_URL: z.url().optional(),
  ZENTHOR_FINANCE_SERVICE_KEY: z.string().min(1).optional(),
  ZENTHOR_FINANCE_ORG_ID: z.string().min(1).optional(),
  AGENT_ROLE: z
    .enum([
      "all",
      "core",
      "whatsapp",
      "whatsapp-ingress",
      "whatsapp-egress",
      "whatsapp-cloud",
      "telegram",
      "telegram-egress",
    ])
    .optional(),
  WORKER_ID: z.string().min(1).optional(),
  AGENT_JOB_LOCK_MS: z.coerce.number().optional(),
  AGENT_JOB_HEARTBEAT_MS: z.coerce.number().optional(),
  AGENT_MAX_DELEGATION_DEPTH: z.coerce.number().optional(),
  AGENT_SUBAGENT_TIMEOUT_MS: z.coerce.number().optional(),
  ENABLE_WHATSAPP: z.string().optional(),
  WHATSAPP_ACCOUNT_ID: z.string().min(1).optional(),
  WHATSAPP_PHONE: z.string().min(1).optional(),
  WHATSAPP_LEASE_TTL_MS: z.coerce.number().optional(),
  WHATSAPP_AUTH_MODE: z.enum(["local", "convex"]).optional().default("local"),
  WHATSAPP_HEARTBEAT_MS: z.coerce.number().optional(),
  WHATSAPP_CLOUD_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_CLOUD_ACCOUNT_ID: z.string().min(1).optional(),
  WHATSAPP_CLOUD_PHONE: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  TELEGRAM_ACCOUNT_ID: z.string().min(1).optional(),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  AXIOM_TOKEN: z.string().min(1).optional(),
  AXIOM_DATASET: z.string().min(1).optional(),
  SENTRY_DSN: z.string().min(1).optional(),
  SENTRY_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value !== "false"),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional().default(0),
  SENTRY_ENVIRONMENT: z.string().min(1).optional(),
  SENTRY_RELEASE: z.string().min(1).optional(),
  OBS_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value !== "false"),
  OBS_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional().default(1),
  OBS_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),
  OBS_INCLUDE_CONTENT: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const env = envSchema.parse(process.env);
