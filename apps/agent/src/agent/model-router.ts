import { env } from "@zenthor-assist/env/agent";

import { logger } from "../observability/logger";

interface RouteContext {
  channel: "web" | "whatsapp";
  toolCount: number;
  messageCount: number;
}

type ModelTier = "lite" | "standard" | "power";

interface RouteResult {
  primary: string;
  fallbacks: string[];
  tier: ModelTier;
}

/** Thresholds for escalating from lite → standard tier. */
const TOOL_THRESHOLD = 5;
const MESSAGE_THRESHOLD = 15;

/**
 * Determines whether the task complexity warrants the standard tier.
 * High tool count signals multi-step orchestration; long context signals
 * nuanced conversation history that benefits from a stronger model.
 */
function isComplexTask(ctx: RouteContext): boolean {
  return ctx.toolCount >= TOOL_THRESHOLD || ctx.messageCount >= MESSAGE_THRESHOLD;
}

export function selectModel(ctx: RouteContext): RouteResult {
  const lite = env.AI_LITE_MODEL;
  const standard = env.AI_MODEL;
  const power = env.AI_FALLBACK_MODEL;

  const buildFallbacks = (...models: (string | undefined)[]): string[] =>
    models.filter((m): m is string => Boolean(m));

  const complex = isComplexTask(ctx);

  // Complex tasks always use the standard model regardless of channel
  if (complex) {
    void logger.info("agent.model.route.selected", {
      tier: "standard",
      channel: ctx.channel,
      toolCount: ctx.toolCount,
      messageCount: ctx.messageCount,
      model: standard,
    });
    return {
      primary: standard,
      fallbacks: buildFallbacks(power),
      tier: "standard",
    };
  }

  // Simple tasks use the lite model (fast + cheap) on any channel
  if (ctx.channel === "whatsapp") {
    void logger.info("agent.model.route.selected", {
      tier: "lite",
      channel: ctx.channel,
      toolCount: ctx.toolCount,
      messageCount: ctx.messageCount,
      model: lite,
    });
    return {
      primary: lite,
      fallbacks: buildFallbacks(standard, power),
      tier: "lite",
    };
  }

  // Web simple tasks also use lite, with standard as first fallback
  void logger.info("agent.model.route.selected", {
    tier: "lite",
    channel: ctx.channel,
    toolCount: ctx.toolCount,
    messageCount: ctx.messageCount,
    model: lite,
  });
  return {
    primary: lite,
    fallbacks: buildFallbacks(standard, power),
    tier: "lite",
  };
}
