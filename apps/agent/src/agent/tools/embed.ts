import { env } from "@zenthor-assist/env/agent";
import { embed } from "ai";

import { getAIGateway } from "../ai-gateway";

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = getAIGateway().embeddingModel(env.AI_EMBEDDING_MODEL);
  const { embedding } = await embed({ model, value: text });
  return embedding;
}
