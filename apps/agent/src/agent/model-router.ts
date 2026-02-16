import { env } from "@zenthor-assist/env/agent";

import { logger } from "../observability/logger";

export interface RouteContext {
  channel: "web" | "whatsapp" | "telegram";
  toolCount: number;
  messageCount: number;
}

export type ModelTier = "lite" | "standard" | "power";

export interface RouteResult {
  primary: string;
  fallbacks: string[];
  tier: ModelTier;
  reason: string;
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

  // WhatsApp always uses the lite model — fast responses matter more than
  // model strength, and the compaction system handles long conversations.
  if (ctx.channel === "whatsapp") {
    void logger.info("agent.model.route.selected", {
      routeTier: "lite",
      tier: "lite",
      channel: ctx.channel,
      toolCount: ctx.toolCount,
      messageCount: ctx.messageCount,
      model: lite,
      reason: "whatsapp_always_lite",
    });
    return {
      primary: lite,
      fallbacks: buildFallbacks(standard, power),
      tier: "lite",
      reason: "whatsapp_always_lite",
    };
  }

  // Web: escalate to standard for complex tasks
  const complex = isComplexTask(ctx);
  if (complex) {
    void logger.info("agent.model.route.selected", {
      routeTier: "standard",
      tier: "standard",
      channel: ctx.channel,
      toolCount: ctx.toolCount,
      messageCount: ctx.messageCount,
      model: standard,
      reason: "complexity_thresholds_met",
    });
    return {
      primary: standard,
      fallbacks: buildFallbacks(power),
      tier: "standard",
      reason: "complexity_thresholds_met",
    };
  }

  // Web simple tasks use lite, with standard as first fallback
  void logger.info("agent.model.route.selected", {
    routeTier: "lite",
    tier: "lite",
    channel: ctx.channel,
    toolCount: ctx.toolCount,
    messageCount: ctx.messageCount,
    model: lite,
    reason: "simple_path",
  });
  return {
    primary: lite,
    fallbacks: buildFallbacks(standard, power),
    tier: "lite",
    reason: "simple_path",
  };
}
