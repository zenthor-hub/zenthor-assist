import { env } from "@zenthor-assist/env/agent";
import type { Tool } from "ai";
import { generateText, stepCountIs, streamText } from "ai";

import { logger } from "../observability/logger";
import { getAIProvider } from "./ai-gateway";
import { runWithFallback } from "./model-fallback";
import { selectModel } from "./model-router";
import { tools } from "./tools";
import { getWebSearchTool } from "./tools/web-search";

const NOTE_TOOL_CONFIRMATION_PROMPT = `

## Note generation confirmation policy
- When a user asks for a note created from chat history or asks an AI to shape notes, ask clarifying questions first when intent is unclear.
- Confirm at least: target outcome, included scope, depth, and preferred structure (summary, checklist, itinerary, draft, etc.).
- Ask for folder/title only when not explicitly provided.
- Ask one concise clarification question at a time and wait for the user's answer before calling note tools.
- Apply this broadly to note workflows whenever likely ambiguity could change the output.
`;

/**
 * The Codex endpoint requires system instructions via the `instructions`
 * field in the request body. The AI SDK normally maps `system` into the
 * input array as a system-role message, but Codex ignores that and
 * requires `instructions` explicitly via provider options.
 */
function buildProviderOptions(
  mode: string,
  systemPrompt: string,
): Record<string, Record<string, string | boolean>> | undefined {
  if (mode !== "openai_subscription") return undefined;
  return {
    openai: { instructions: systemPrompt, store: false },
  };
}

const BASE_SYSTEM_PROMPT = `You are a helpful personal AI assistant for Guilherme (gbarros). You can assist with questions, tasks, and general conversation. Be concise but friendly. When you don't know something, say so. Use tools when appropriate.

## Tool usage guidance
- Use \`calculate\` for precise math instead of doing mental arithmetic.
- Use \`date_calc\` for date arithmetic, differences between dates, or getting day-of-week/week-number info.
- Use web search tools (\`web_search\` when available, otherwise \`internet_search\`) when the user asks for current events, latest information, or anything that requires searching the web.
- Use \`browse_url\` to read web pages, articles, or documentation when the user shares a URL or you need to look up page content.
- Use \`memory_search\` and \`memory_store\` to recall and save important facts across conversations.
- Use \`note_list\`, \`note_get\`, \`note_create\`, \`note_update\`, \`note_move\`, \`note_archive\`, \`note_generate_from_conversation\`, \`note_transform\`, \`note_apply_transform\`, and \`note_update_from_ai\` for note authoring and maintenance workflows.
- Use \`schedule_task\` to set up recurring reminders or tasks.
- Use task tools (\`task_create\`, \`task_list\`, \`task_update\`, \`task_complete\`, \`task_delete\`) for actionable personal planning and task management.
- Use \`get_current_time\` when you need the current date or time.
- Use finance tools (\`finance_list_accounts\`, \`finance_account_summary\`, \`finance_list_transactions\`, \`finance_spending_summary\`, \`finance_spending_by_category\`, \`finance_list_categories\`) to look up financial data.
- Use \`finance_create_transaction\` or \`finance_create_transfer\` to record new transactions. Always confirm the details with the user before creating.
- When creating transactions, use \`finance_list_accounts\` to find the correct account_id and \`finance_list_categories\` for the category_id.
- Use \`date_calc\` to resolve natural-language dates to timestamps before passing to finance tools.

## Audio messages
You DO have full audio/voice note support. When users send voice notes on WhatsApp, they are automatically transcribed and delivered to you as text — you see the transcript directly as a user message. Treat voice note transcripts naturally; the user spoke those words.
IMPORTANT: NEVER tell users you cannot hear, process, or handle audio messages. You absolutely CAN — the transcription is automatic and invisible to the user. If a message seems conversational or spoken, it was likely a voice note. Respond to it normally.`;

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
  channel?: "web" | "whatsapp" | "telegram",
  noteContext?: { title: string; preview?: string },
): string {
  const basePrompt = agentConfig?.systemPrompt ?? BASE_SYSTEM_PROMPT;

  let prompt = basePrompt;

  if (channel === "whatsapp") {
    prompt += WHATSAPP_FORMATTING_INSTRUCTIONS;
  }

  if (!skills || skills.length === 0) {
    if (!noteContext) return `${prompt}${NOTE_TOOL_CONFIRMATION_PROMPT}`;
  } else {
    const skillsSection = skills
      .map((s) => {
        const lines = [`### ${s.name}`, s.description];
        if (s.config?.systemPrompt) lines.push(s.config.systemPrompt);
        return lines.join("\n");
      })
      .join("\n\n");

    prompt = `${prompt}\n\n## Active Skills\n\n${skillsSection}`;
  }

  if (!noteContext) return `${prompt}${NOTE_TOOL_CONFIRMATION_PROMPT}`;

  const commandHints = [
    "/organize — restructure sections",
    "/rewrite — apply a stronger structure",
    "/expand — enrich the current draft",
    "/summarize — condense with headings",
    "/extract — produce key list",
    "/clean-style — refine writing quality",
    "/ask — keep discussion context but stay note-aware",
  ].join("\n");

  return `${prompt}${NOTE_TOOL_CONFIRMATION_PROMPT}\n\n## Note-editor mode\nYou are operating as an AI note editor for "${noteContext.title}". Provide concise edit-focused responses and prefer machine-readable change suggestions.\nWhen the user asks for an edit command, first return a structured proposal with fields resultText and operations.\nAvailable commands:\n${commandHints}\n\nCurrent note preview:\n${noteContext.preview ?? "(empty)"}`;
}

function getDefaultTools(modelName: string): Record<string, Tool> {
  return {
    ...tools,
    ...getWebSearchTool(modelName),
  };
}

const SEARCH_TOOL_NAMES = ["web_search", "google_search", "internet_search"] as const;

function removeProviderSearchTools(allTools: Record<string, Tool>): Record<string, Tool> {
  const next = { ...allTools };
  for (const searchToolName of SEARCH_TOOL_NAMES) {
    delete next[searchToolName];
  }
  return next;
}

function shouldRetryWithoutProviderSearch(mode: string, err: unknown): boolean {
  if (mode !== "openai_subscription") return false;

  const maybeError = err as { message?: string; status?: number; statusCode?: number };
  const status = maybeError.status ?? maybeError.statusCode;
  const message = maybeError.message ?? String(err);

  // Codex web-search/tool schema errors surface as HTTP 400 with tool-related details.
  return (
    status === 400 &&
    /(web[_\s-]?search|tool|unsupported|invalid request|bad request|responses)/i.test(message)
  );
}

function resolveToolsForModel(
  modelName: string,
  toolsOverride?: Record<string, Tool>,
): Record<string, Tool> {
  if (!toolsOverride) {
    return getDefaultTools(modelName);
  }

  const resolved: Record<string, Tool> = { ...toolsOverride };
  let hasSearchCapability = false;

  for (const searchToolName of SEARCH_TOOL_NAMES) {
    if (searchToolName in resolved) {
      hasSearchCapability = true;
      delete resolved[searchToolName];
    }
  }

  if (hasSearchCapability) {
    Object.assign(resolved, getWebSearchTool(modelName) as Record<string, Tool>);
  }

  return resolved;
}

interface GenerateOptions {
  modelOverride?: string;
  toolsOverride?: Record<string, Tool>;
  agentConfig?: AgentConfig;
  channel?: "web" | "whatsapp" | "telegram";
  toolCount?: number;
  messageCount?: number;
  noteContext?: {
    title: string;
    preview?: string;
  };
}

function resolveModels(options?: GenerateOptions): {
  primaryModel: string;
  fallbackModels: string[];
} {
  // Explicit agent config takes priority (skip routing)
  if (options?.agentConfig?.model) {
    const fallbacks: string[] = [];
    if (options.agentConfig.fallbackModel) fallbacks.push(options.agentConfig.fallbackModel);
    else if (env.AI_FALLBACK_MODEL) fallbacks.push(env.AI_FALLBACK_MODEL);
    return { primaryModel: options.agentConfig.model, fallbackModels: fallbacks };
  }

  // Explicit model override takes priority
  if (options?.modelOverride) {
    const fallbacks: string[] = [];
    if (env.AI_FALLBACK_MODEL) fallbacks.push(env.AI_FALLBACK_MODEL);
    return { primaryModel: options.modelOverride, fallbackModels: fallbacks };
  }

  // Use router for dynamic selection
  const route = selectModel({
    channel: options?.channel ?? "web",
    toolCount: options?.toolCount ?? 0,
    messageCount: options?.messageCount ?? 0,
  });
  return { primaryModel: route.primary, fallbackModels: route.fallbacks };
}

export async function generateResponse(
  conversationMessages: Message[],
  skills?: Skill[],
  options?: GenerateOptions,
): Promise<GenerateResult> {
  const startedAt = Date.now();
  const { primaryModel, fallbackModels } = resolveModels(options);
  void logger.info("agent.model.generate.started", {
    mode: "non_streaming",
    primaryModel,
    fallbackModels,
    messageCount: conversationMessages.length,
    channel: options?.channel,
  });

  const systemPrompt = buildSystemPrompt(
    skills,
    options?.agentConfig,
    options?.channel,
    options?.noteContext,
  );

  const useStreaming = (await getAIProvider()).mode === "openai_subscription";

  const { result, modelUsed } = await runWithFallback({
    primaryModel,
    fallbackModels,
    run: async (modelName) => {
      const provider = await getAIProvider();
      const m = provider.model(modelName);
      const resolvedTools = resolveToolsForModel(modelName, options?.toolsOverride);
      const providerOptions = buildProviderOptions(provider.mode, systemPrompt);

      const callOptions = {
        model: m,
        system: systemPrompt,
        messages: conversationMessages,
        stopWhen: stepCountIs(10),
        providerOptions,
      };

      const execute = async (toolsToUse: Record<string, Tool>) => {
        if (useStreaming) {
          // Subscription endpoints require stream=true; consume the stream fully.
          const stream = streamText({ ...callOptions, tools: toolsToUse });
          const text = await stream.text;
          const steps = await stream.steps;
          return { text, steps };
        }
        const gen = await generateText({ ...callOptions, tools: toolsToUse });
        return { text: gen.text, steps: gen.steps };
      };

      let completed;
      try {
        completed = await execute(resolvedTools);
      } catch (err) {
        const hasProviderSearchTool = SEARCH_TOOL_NAMES.some((name) => name in resolvedTools);
        if (!hasProviderSearchTool || !shouldRetryWithoutProviderSearch(provider.mode, err)) {
          throw err;
        }

        void logger.warn("agent.model.search_tool.fallback", {
          modelName,
          channel: options?.channel,
          mode: provider.mode,
        });

        completed = await execute(removeProviderSearchTools(resolvedTools));
      }

      const allToolCalls = completed.steps.flatMap((step) => step.toolCalls);
      const allToolResults = completed.steps.flatMap((step) => step.toolResults);

      const resultsByCallId = new Map(allToolResults.map((tr) => [tr.toolCallId, tr.output]));

      const toolCalls = allToolCalls.map((tc) => ({
        name: tc.toolName,
        input: tc.input,
        output: resultsByCallId.get(tc.toolCallId),
      }));

      return {
        content: completed.text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    },
  });

  void logger.info("agent.model.generate.completed", {
    mode: useStreaming ? "stream_consumed" : "non_streaming",
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
  options?: GenerateOptions,
): Promise<GenerateResult> {
  const startedAt = Date.now();
  const { primaryModel, fallbackModels } = resolveModels(options);
  void logger.info("agent.model.generate.started", {
    mode: "streaming",
    primaryModel,
    fallbackModels,
    messageCount: conversationMessages.length,
    channel: options?.channel,
  });

  const streamSystemPrompt = buildSystemPrompt(
    skills,
    options?.agentConfig,
    options?.channel,
    options?.noteContext,
  );

  const { result, modelUsed } = await runWithFallback({
    primaryModel,
    fallbackModels,
    run: async (modelName) => {
      const provider = await getAIProvider();
      const m = provider.model(modelName);
      const resolvedTools = resolveToolsForModel(modelName, options?.toolsOverride);
      const providerOptions = buildProviderOptions(provider.mode, streamSystemPrompt);

      const executeStream = async (toolsToUse: Record<string, Tool>) => {
        const streamResult = streamText({
          model: m,
          system: streamSystemPrompt,
          messages: conversationMessages,
          tools: toolsToUse,
          stopWhen: stepCountIs(10),
          providerOptions,
        });

        let accumulated = "";
        for await (const chunk of streamResult.textStream) {
          accumulated += chunk;
          callbacks?.onChunk(accumulated);
        }

        const steps = await streamResult.steps;
        const text = await streamResult.text;
        return { steps, text };
      };

      let streamed;
      try {
        streamed = await executeStream(resolvedTools);
      } catch (err) {
        const hasProviderSearchTool = SEARCH_TOOL_NAMES.some((name) => name in resolvedTools);
        if (!hasProviderSearchTool || !shouldRetryWithoutProviderSearch(provider.mode, err)) {
          throw err;
        }

        void logger.warn("agent.model.search_tool.fallback", {
          modelName,
          channel: options?.channel,
          mode: provider.mode,
        });

        streamed = await executeStream(removeProviderSearchTools(resolvedTools));
      }

      const { steps, text } = streamed;

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
