import { createGateway } from "@ai-sdk/gateway";
import { env } from "@zenthor-assist/env/agent";
import type { Tool } from "ai";
import { generateText, stepCountIs, streamText } from "ai";

import { logger } from "../observability/logger";
import { runWithFallback } from "./model-fallback";
import { tools } from "./tools";
import { getWebSearchTool } from "./tools/web-search";

const gateway = createGateway({
  apiKey: env.AI_GATEWAY_API_KEY,
});

const BASE_SYSTEM_PROMPT = `You are a helpful personal AI assistant for Guilherme (gbarros). You can assist with questions, tasks, and general conversation. Be concise but friendly. When you don't know something, say so. Use tools when appropriate.

## Tool usage guidance
- Use \`calculate\` for precise math instead of doing mental arithmetic.
- Use \`date_calc\` for date arithmetic, differences between dates, or getting day-of-week/week-number info.
- Use \`browse_url\` to read web pages, articles, or documentation when the user shares a URL or you need to look up page content.
- Use \`memory_search\` and \`memory_store\` to recall and save important facts across conversations.
- Use \`schedule_task\` to set up recurring reminders or tasks.
- Use Todoist tools (\`todoist_capture_task\`, \`todoist_list_tasks\`, \`todoist_complete_task\`, \`todoist_reschedule_task\`) for actionable personal planning when the user has connected Todoist.
- Use \`get_current_time\` when you need the current date or time.`;

interface Skill {
  name: string;
  description: string;
  config?: { systemPrompt?: string };
}

export interface AgentConfig {
  systemPrompt?: string;
  model?: string;
  fallbackModel?: string;
  toolPolicy?: { allow?: string[]; deny?: string[] };
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ToolCallRecord {
  name: string;
  input: unknown;
  output?: unknown;
}

interface GenerateResult {
  content: string;
  toolCalls?: ToolCallRecord[];
  modelUsed: string;
}

function getModel(name: string) {
  return gateway(name);
}

const WHATSAPP_FORMATTING_INSTRUCTIONS = `

## Formatting Rules (WhatsApp)

You are replying on WhatsApp. Follow these formatting rules strictly:
- Use *bold* for emphasis (single asterisks, NOT double)
- Use _italic_ for secondary emphasis (single underscores)
- Use ~strikethrough~ for corrections
- Use \`\`\`code\`\`\` for code blocks (triple backticks)
- Use \`inline code\` for short code references
- NEVER use markdown headers (# ## ###) — use *bold* text on its own line instead
- NEVER use markdown links [text](url) — write the URL directly or say "text: url"
- NEVER use markdown images ![alt](url)
- Use simple bullet points with - or • characters
- Keep numbered lists as plain "1. item" format
- Keep messages concise — WhatsApp is a chat, not a document
- Use line breaks to separate sections instead of headers
- Avoid long paragraphs — break them into shorter chunks`;

function buildSystemPrompt(
  skills?: Skill[],
  agentConfig?: AgentConfig,
  channel?: "web" | "whatsapp",
): string {
  const basePrompt = agentConfig?.systemPrompt ?? BASE_SYSTEM_PROMPT;

  let prompt = basePrompt;

  if (channel === "whatsapp") {
    prompt += WHATSAPP_FORMATTING_INSTRUCTIONS;
  }

  if (!skills || skills.length === 0) return prompt;

  const skillsSection = skills
    .map((s) => {
      const lines = [`### ${s.name}`, s.description];
      if (s.config?.systemPrompt) lines.push(s.config.systemPrompt);
      return lines.join("\n");
    })
    .join("\n\n");

  return `${prompt}\n\n## Active Skills\n\n${skillsSection}`;
}

function getDefaultTools(modelName: string): Record<string, Tool> {
  return {
    ...tools,
    ...getWebSearchTool(modelName),
  };
}

export async function generateResponse(
  conversationMessages: Message[],
  skills?: Skill[],
  options?: {
    modelOverride?: string;
    toolsOverride?: Record<string, Tool>;
    agentConfig?: AgentConfig;
    channel?: "web" | "whatsapp";
  },
): Promise<GenerateResult> {
  const startedAt = Date.now();
  const primaryModel = options?.agentConfig?.model ?? options?.modelOverride ?? env.AI_MODEL;
  const fallbackModel = options?.agentConfig?.fallbackModel ?? env.AI_FALLBACK_MODEL;
  void logger.info("agent.model.generate.started", {
    mode: "non_streaming",
    primaryModel,
    hasFallbackModel: Boolean(fallbackModel),
    messageCount: conversationMessages.length,
    channel: options?.channel,
  });

  const { result, modelUsed } = await runWithFallback({
    primaryModel,
    fallbackModel,
    run: async (modelName) => {
      const m = getModel(modelName);
      const result = await generateText({
        model: m,
        system: buildSystemPrompt(skills, options?.agentConfig, options?.channel),
        messages: conversationMessages,
        tools: options?.toolsOverride ?? getDefaultTools(modelName),
        stopWhen: stepCountIs(10),
      });

      const allToolCalls = result.steps.flatMap((step) => step.toolCalls);
      const allToolResults = result.steps.flatMap((step) => step.toolResults);

      const resultsByCallId = new Map(allToolResults.map((tr) => [tr.toolCallId, tr.output]));

      const toolCalls = allToolCalls.map((tc) => ({
        name: tc.toolName,
        input: tc.input,
        output: resultsByCallId.get(tc.toolCallId),
      }));

      return {
        content: result.text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    },
  });

  void logger.info("agent.model.generate.completed", {
    mode: "non_streaming",
    modelUsed,
    durationMs: Date.now() - startedAt,
    channel: options?.channel,
  });
  return { ...result, modelUsed };
}

interface StreamCallbacks {
  onChunk: (accumulatedText: string) => void;
}

export async function generateResponseStreaming(
  conversationMessages: Message[],
  skills?: Skill[],
  callbacks?: StreamCallbacks,
  options?: {
    modelOverride?: string;
    toolsOverride?: Record<string, Tool>;
    agentConfig?: AgentConfig;
    channel?: "web" | "whatsapp";
  },
): Promise<GenerateResult> {
  const startedAt = Date.now();
  const primaryModel = options?.agentConfig?.model ?? options?.modelOverride ?? env.AI_MODEL;
  const fallbackModel = options?.agentConfig?.fallbackModel ?? env.AI_FALLBACK_MODEL;
  void logger.info("agent.model.generate.started", {
    mode: "streaming",
    primaryModel,
    hasFallbackModel: Boolean(fallbackModel),
    messageCount: conversationMessages.length,
    channel: options?.channel,
  });

  const { result, modelUsed } = await runWithFallback({
    primaryModel,
    fallbackModel,
    run: async (modelName) => {
      const m = getModel(modelName);
      const streamResult = streamText({
        model: m,
        system: buildSystemPrompt(skills, options?.agentConfig, options?.channel),
        messages: conversationMessages,
        tools: options?.toolsOverride ?? getDefaultTools(modelName),
        stopWhen: stepCountIs(10),
      });

      let accumulated = "";
      for await (const chunk of streamResult.textStream) {
        accumulated += chunk;
        callbacks?.onChunk(accumulated);
      }

      const steps = await streamResult.steps;
      const text = await streamResult.text;

      const allToolCalls = steps.flatMap((step) => step.toolCalls);
      const allToolResults = steps.flatMap((step) => step.toolResults);

      const resultsByCallId = new Map(allToolResults.map((tr) => [tr.toolCallId, tr.output]));

      const toolCalls = allToolCalls.map((tc) => ({
        name: tc.toolName,
        input: tc.input,
        output: resultsByCallId.get(tc.toolCallId),
      }));

      return {
        content: text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    },
  });

  void logger.info("agent.model.generate.completed", {
    mode: "streaming",
    modelUsed,
    durationMs: Date.now() - startedAt,
    channel: options?.channel,
  });
  return { ...result, modelUsed };
}
