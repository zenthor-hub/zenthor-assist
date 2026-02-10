import { env } from "@zenthor-assist/env/agent";
import { embed } from "ai";

import { getAIProvider } from "../ai-gateway";

export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = await getAIProvider();
  const model = provider.embeddingModel(env.AI_EMBEDDING_MODEL);
  const { embedding } = await embed({ model, value: text });
  return embedding;
}
