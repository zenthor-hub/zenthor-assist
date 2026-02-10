import { createGateway, type GatewayProvider } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import { env } from "@zenthor-assist/env/agent";
import type { EmbeddingModel, LanguageModel } from "ai";

import { logger } from "../observability/logger";
import { createSubscriptionFetch } from "./subscription/token-manager";

// ---------------------------------------------------------------------------
// Provider mode type
// ---------------------------------------------------------------------------

export type ProviderMode = "gateway" | "openai_subscription";

export function getProviderMode(): ProviderMode {
  return env.AI_PROVIDER_MODE;
}

// ---------------------------------------------------------------------------
// Unified provider interface
// ---------------------------------------------------------------------------

export interface AIProvider {
  mode: ProviderMode;
  model(modelId: string): LanguageModel;
  embeddingModel(modelId: string): EmbeddingModel;
}

// ---------------------------------------------------------------------------
// Model ID normalization
// ---------------------------------------------------------------------------

/**
 * In subscription mode, endpoints expect bare model names (e.g. `gpt-5.3-codex`)
 * rather than prefixed `provider/model` strings.
 * Gateway mode passes IDs unchanged.
 */
export function normalizeModelId(mode: ProviderMode, modelId: string): string {
  if (mode !== "openai_subscription") return modelId;
  const slashIndex = modelId.indexOf("/");
  return slashIndex >= 0 ? modelId.slice(slashIndex + 1) : modelId;
}

// ---------------------------------------------------------------------------
// Gateway provider (default, unchanged behavior)
// ---------------------------------------------------------------------------

let gatewayInstance: GatewayProvider | null = null;

function getGatewayProvider(): AIProvider {
  const apiKey = env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required for model generation");
  }

  if (!gatewayInstance) {
    gatewayInstance = createGateway({ apiKey });
  }

  const gw = gatewayInstance;

  return {
    mode: "gateway",
    model(modelId: string) {
      return gw(modelId);
    },
    embeddingModel(modelId: string) {
      return gw.embeddingModel(modelId);
    },
  };
}

// ---------------------------------------------------------------------------
// OpenAI subscription provider (personal ChatGPT Plus/Pro)
// ---------------------------------------------------------------------------

let subscriptionProvider: AIProvider | null = null;

async function getSubscriptionProvider(): Promise<AIProvider> {
  if (subscriptionProvider) return subscriptionProvider;

  void logger.lineWarn(
    "[ai-provider] Using EXPERIMENTAL openai_subscription mode (personal use only)",
  );

  const subscriptionFetch = await createSubscriptionFetch();

  // Use createOpenAI with a dummy API key — the custom fetch
  // replaces the authorization header with the subscription token.
  const openai = createOpenAI({
    apiKey: "subscription-managed",
    fetch: subscriptionFetch,
  });

  // Embeddings stay on gateway for reliability
  const embeddingApiKey = env.AI_GATEWAY_API_KEY;
  const embeddingGw = embeddingApiKey ? createGateway({ apiKey: embeddingApiKey }) : null;

  const provider: AIProvider = {
    mode: "openai_subscription",
    model(modelId: string) {
      const normalized = normalizeModelId("openai_subscription", modelId);
      return openai.responses(normalized);
    },
    embeddingModel(modelId: string) {
      if (embeddingGw) {
        return embeddingGw.embeddingModel(modelId);
      }
      throw new Error(
        "AI_GATEWAY_API_KEY is required for embeddings even in openai_subscription mode",
      );
    },
  };

  subscriptionProvider = provider;
  return provider;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let resolvedProvider: AIProvider | null = null;

/**
 * Returns the AI provider based on `AI_PROVIDER_MODE`.
 * Gateway mode is synchronous; subscription mode requires async init on first call.
 */
export async function getAIProvider(): Promise<AIProvider> {
  if (resolvedProvider) return resolvedProvider;

  const mode = getProviderMode();
  if (mode === "openai_subscription") {
    resolvedProvider = await getSubscriptionProvider();
  } else {
    resolvedProvider = getGatewayProvider();
  }

  return resolvedProvider;
}

/**
 * Backward-compatible synchronous accessor for gateway mode only.
 * Throws if called in subscription mode before async init.
 *
 * @public
 * @deprecated Use `getAIProvider()` instead.
 */
export function getAIGateway(): GatewayProvider {
  const apiKey = env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required for model generation");
  }

  if (!gatewayInstance) {
    gatewayInstance = createGateway({ apiKey });
  }

  return gatewayInstance;
}

/**
 * Reset cached providers (useful for tests).
 * @public
 */
export function _resetProviders(): void {
  gatewayInstance = null;
  subscriptionProvider = null;
  resolvedProvider = null;
}
