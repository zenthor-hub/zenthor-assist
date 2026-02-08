import { env } from "@zenthor-assist/env/agent";

import { logger } from "../observability/logger";

interface RouteContext {
  channel: "web" | "whatsapp";
  toolCount: number;
}

type ModelTier = "lite" | "standard" | "power";

interface RouteResult {
  primary: string;
  fallbacks: string[];
  tier: ModelTier;
}

export function selectModel(ctx: RouteContext): RouteResult {
  const lite = env.AI_LITE_MODEL;
  const standard = env.AI_MODEL;
  const power = env.AI_FALLBACK_MODEL;

  const buildFallbacks = (...models: (string | undefined)[]): string[] =>
    models.filter((m): m is string => Boolean(m));

  // WhatsApp conversations are simpler — use the lite (cheapest) model
  if (ctx.channel === "whatsapp") {
    void logger.info("agent.model.route.selected", {
      tier: "lite",
      channel: ctx.channel,
      toolCount: ctx.toolCount,
      model: lite,
    });
    return {
      primary: lite,
      fallbacks: buildFallbacks(standard, power),
      tier: "lite",
    };
  }

  // Web conversations use the standard model
  void logger.info("agent.model.route.selected", {
    tier: "standard",
    channel: ctx.channel,
    toolCount: ctx.toolCount,
    model: standard,
  });
  return {
    primary: standard,
    fallbacks: buildFallbacks(power),
    tier: "standard",
  };
}
