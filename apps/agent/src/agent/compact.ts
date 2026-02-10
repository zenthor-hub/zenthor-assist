import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { env } from "@zenthor-assist/env/agent";
import { generateText } from "ai";

import { getConvexClient } from "../convex/client";
import { logger } from "../observability/logger";
import { getAIProvider } from "./ai-gateway";
import {
  DEFAULT_CONTEXT_WINDOW,
  estimateMessagesTokens,
  estimateTokens,
  evaluateContext,
} from "./context-guard";
import { generateEmbedding } from "./tools/embed";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

const COMPACTION_THRESHOLD = 50;
const SUMMARIZER_SYSTEM =
  "You are a conversation summarizer. Summarize the following conversation into a concise paragraph that preserves key facts, decisions, and context. Start with '[Conversation Summary]'.";

function splitByTokenBudget(messages: Message[], budgetPerChunk: number): Message[][] {
  const chunks: Message[][] = [];
  let current: Message[] = [];
  let currentTokens = 0;

  for (const msg of messages) {
    const msgTokens = estimateTokens(msg.content) + 4;
    if (current.length > 0 && currentTokens + msgTokens > budgetPerChunk) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(msg);
    currentTokens += msgTokens;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function findRecentSplitByBudget(messages: Message[], recentBudget: number): number {
  let tokens = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    tokens += estimateTokens(msg.content) + 4;
    if (tokens > recentBudget) {
      return i + 1;
    }
  }
  return 0;
}

async function summarizeChunk(chunk: Message[]): Promise<string> {
  const content = chunk.map((m) => `${m.role}: ${m.content}`).join("\n\n");
  const provider = await getAIProvider();
  const model = provider.model(env.AI_MODEL);

  const result = await generateText({
    model,
    system: SUMMARIZER_SYSTEM,
    messages: [{ role: "user", content }],
  });

  return result.text;
}

async function summarizeWithFallback(chunks: Message[][]): Promise<string> {
  // Try full summary of all chunks
  try {
    const chunkSummaries = await Promise.all(chunks.map(summarizeChunk));

    if (chunkSummaries.length === 1) {
      return chunkSummaries[0]!;
    }

    // Merge multiple summaries into one
    const provider = await getAIProvider();
    const model = provider.model(env.AI_MODEL);
    const merged = await generateText({
      model,
      system: SUMMARIZER_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Merge these summaries into one:\n\n${chunkSummaries.join("\n\n---\n\n")}`,
        },
      ],
    });

    return merged.text;
  } catch {
    // Fallback: metadata-only note
    const totalMessages = chunks.reduce((sum, c) => sum + c.length, 0);
    return `[Conversation Summary] Previous conversation contained ${totalMessages} messages. Context was truncated for continuity.`;
  }
}

export async function compactMessages(
  messages: Message[],
  contextWindow?: number,
  conversationId?: Id<"conversations">,
): Promise<{ messages: Message[]; summary?: string }> {
  const maxContext = contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const guard = evaluateContext(messages, maxContext);

  // Trigger compaction if token-based threshold OR message count threshold
  if (!guard.shouldCompact && messages.length <= COMPACTION_THRESHOLD) {
    return { messages };
  }

  // Keep recent messages by token budget (last 30% of context)
  const recentBudget = Math.floor(maxContext * 0.3);
  const splitIndex = findRecentSplitByBudget(messages, recentBudget);

  // Ensure we keep at least some messages and have something to summarize
  const effectiveSplit = Math.max(1, Math.min(splitIndex, messages.length - 1));
  const oldMessages = messages.slice(0, effectiveSplit);
  const recentMessages = messages.slice(effectiveSplit);

  if (oldMessages.length === 0) {
    return { messages };
  }

  // Split old messages into token-budget chunks (each ≤ 40% of context window)
  const chunkBudget = Math.floor(maxContext * 0.4);
  const chunks = splitByTokenBudget(oldMessages, chunkBudget);

  const summaryText = await summarizeWithFallback(chunks);

  // Auto-store compaction summary as memory
  try {
    const embedding = await generateEmbedding(summaryText);
    const client = getConvexClient();
    await client.action(api.memories.store, {
      content: summaryText,
      embedding,
      source: "conversation" as const,
      ...(conversationId !== undefined && { conversationId }),
    });
  } catch {
    // Non-critical: don't fail compaction if memory storage fails
    void logger.lineWarn("[compact] Failed to store compaction summary as memory");
    void logger.warn("agent.compact.memory_store_failed");
  }

  const summaryMessage: Message = {
    role: "system",
    content: summaryText,
  };

  // If after compaction we're still over budget, keep trimming recent messages
  let finalRecent = recentMessages;
  const summaryTokens = estimateTokens(summaryText) + 4;
  const recentTokens = estimateMessagesTokens(finalRecent);

  if (summaryTokens + recentTokens > maxContext * 0.9) {
    // Trim oldest recent messages until we fit
    let currentTokens = recentTokens;
    let trimIndex = 0;
    while (trimIndex < finalRecent.length - 1 && summaryTokens + currentTokens > maxContext * 0.9) {
      currentTokens -= estimateTokens(finalRecent[trimIndex]!.content) + 4;
      trimIndex++;
    }
    finalRecent = finalRecent.slice(trimIndex);
  }

  return {
    messages: [summaryMessage, ...finalRecent],
    summary: summaryText,
  };
}
