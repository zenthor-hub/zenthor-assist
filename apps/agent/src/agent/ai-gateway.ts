import { createGateway, type GatewayProvider } from "@ai-sdk/gateway";
import { env } from "@zenthor-assist/env/agent";

let gateway: GatewayProvider | null = null;

export function getAIGateway(): GatewayProvider {
  const apiKey = env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required for model generation");
  }

  if (!gateway) {
    gateway = createGateway({ apiKey });
  }

  return gateway;
}
