import { env } from "@zenthor-assist/env/agent";
import type { Tool } from "ai";
import { generateText, stepCountIs, streamText } from "ai";

import { logger } from "../observability/logger";
import { getAIProvider } from "./ai-gateway";
import { runWithFallback } from "./model-fallback";
import { type ModelTier, selectModel } from "./model-router";
import type { PluginToolDescriptor, PluginToolDescriptorMap } from "./plugins/types";
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

const NOTE_EDIT_HINT_PATTERNS = [
  /\b(rewrite|transform|summarize|extract|clean-style|clean up|expand|organize|translate)\b/i,
  /\/rewrite\b/i,
  /\/summarize\b/i,
  /\/extract\b/i,
  /\/expand\b/i,
  /\/organize\b/i,
  /\/clean-style\b/i,
  /\/clean/i,
];

const NOTE_NEW_REQUEST_PATTERNS = [/(?:\b|\W)\/create-note\b/i, /(?:\b|\W)#create-note\b/i];

const NOTE_CREATE_KEYWORDS = /\b(?:create|make|draft|write|generate|start|build)\b/i;
const NOTE_NOUNS = /\b(?:note|notes)\b/i;
const NOTE_NEWNESS_WORDS = /\b(?:new|another|fresh|additional|separate|extra|second|different)\b/i;
const NOTE_EXISTING_REFERENCE_PATTERNS = [
  /\bthis note\b/i,
  /\bcurrent note\b/i,
  /\bexisting note\b/i,
  /\bthat note\b/i,
  /\ban existent note\b/i,
  /\bsame note\b/i,
];

export function isLikelyNewNoteRequest(messages: Message[]) {
  let latestUserMessage: Message | undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      latestUserMessage = messages[i];
      break;
    }
  }

  if (!latestUserMessage) return false;

  const content = latestUserMessage.content;
  if (NOTE_EDIT_HINT_PATTERNS.some((pattern) => pattern.test(content))) {
    return false;
  }

  if (NOTE_NEW_REQUEST_PATTERNS.some((pattern) => pattern.test(content))) {
    return true;
  }

  const hasCreateVerb = NOTE_CREATE_KEYWORDS.test(content);
  const hasNoteNoun = NOTE_NOUNS.test(content);
  if (!hasCreateVerb || !hasNoteNoun) return false;

  if (NOTE_EXISTING_REFERENCE_PATTERNS.some((pattern) => pattern.test(content))) {
    return NOTE_NEWNESS_WORDS.test(content);
  }

  return true;
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

interface ToolContractValidation {
  toolName: string;
  reasons: string[];
}

interface ToolContractContext {
  conversationId?: string;
  jobId?: string;
  channel?: "web" | "whatsapp" | "telegram";
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
  noteContext?: { noteId?: string; title: string; preview?: string },
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
    "/create-note — create a brand-new note (use note_create)",
    "/organize — restructure sections",
    "/rewrite — rewrite the current note",
    "/rewrite this whole note — rewrite the entire note",
    "/rewrite this note — rewrite the entire note",
    "/expand — enrich the current draft",
    "/summarize — condense with headings",
    "/extract — produce key list",
    "/clean-style — refine writing quality",
    "/ask — keep discussion context but stay note-aware",
  ].join("\n");

  const noteIdLine = noteContext.noteId ? `Current note ID: ${noteContext.noteId}\n` : "";
  const commandPolicy =
    "When the latest user message is about editing text in the current note, treat it as an edit intent.\n" +
    'When the user explicitly asks to create a new note (including phrasing like "create a note", "new note", "draft a note", "write me notes", "build a note"), ignore current note context and use note_create.\n' +
    "When slash commands are used, treat them as explicit edit intents:\n" +
    "- /rewrite ... or /rewrite whole note ... → intent: rewrite (full note)\n" +
    "- /rewrite this note ... or /rewrite entire note ... → intent: rewrite (full note)\n" +
    "- /summarize ... → intent: summarize\n" +
    "- /extract ... → intent: extract\n" +
    "- /expand ... → intent: expand\n" +
    "- /organize ... → intent: organize\n" +
    "- /clean-style ... → intent: clean-style\n" +
    "When intent is to transform existing content and is not explicit, infer the most likely command and call note_transform.\n" +
    "When the user asks to add or write new content, use note_update with the 'content' field directly.\n" +
    "Use note_transform for direct full-note rewrites such as: rewrite this note, rewrite this entire note, rewrite the note, clean-up the note.\n" +
    "For full-note rewrite or clean-up, call note_transform first with the current noteId.\n" +
    "Only call note_apply_transform/note_update_from_ai after the user explicitly approves or requested a direct update.\n" +
    "If the user says to forget, ignore, or cancel a previous request, treat the new message as a fresh request — do NOT continue the previous operation.";
  return `${prompt}${NOTE_TOOL_CONFIRMATION_PROMPT}\n\n## Note-editor mode
You are operating as an AI note editor for "${noteContext.title}". Provide concise edit-focused responses and prefer machine-readable change suggestions.
When the user asks for an edit command, first return a structured proposal with fields resultText and operations.
If the request is a full-note rewrite, clean-up, structure change, or reformat, call note_transform for the current note first.
Avoid sending an empty final response after note tool calls.
Available commands:
${commandHints}

Current note preview:
${noteContext.preview ?? "(empty)"}
${noteIdLine}

${commandPolicy}`;
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
  toolContracts?: PluginToolDescriptorMap;
  toolCount?: number;
  messageCount?: number;
  contextMessageCount?: number;
  contextTokenEstimate?: number;
  shouldCompact?: boolean;
  shouldBlock?: boolean;
  policyFingerprint?: string;
  policyMergeSource?: string;
  conversationId?: string;
  jobId?: string;
  noteContext?: {
    noteId?: string;
    title: string;
    preview?: string;
  };
}

interface ResolvedModelConfig {
  primaryModel: string;
  fallbackModels: string[];
  tier: ModelTier;
  reason: string;
  resolveMode: "agent_config_override" | "manual_model_override" | "router";
}

function resolveModels(options?: GenerateOptions): ResolvedModelConfig {
  // Explicit agent config takes priority (skip routing)
  if (options?.agentConfig?.model) {
    const fallbacks: string[] = [];
    if (options.agentConfig.fallbackModel) fallbacks.push(options.agentConfig.fallbackModel);
    else if (env.AI_FALLBACK_MODEL) fallbacks.push(env.AI_FALLBACK_MODEL);
    return {
      primaryModel: options.agentConfig.model,
      fallbackModels: fallbacks,
      tier: "power",
      reason: "agent_config_override",
      resolveMode: "agent_config_override",
    };
  }

  // Explicit model override takes priority
  if (options?.modelOverride) {
    const fallbacks: string[] = [];
    if (env.AI_FALLBACK_MODEL) fallbacks.push(env.AI_FALLBACK_MODEL);
    return {
      primaryModel: options.modelOverride,
      fallbackModels: fallbacks,
      tier: "standard",
      reason: "manual_model_override",
      resolveMode: "manual_model_override",
    };
  }

  // Use router for dynamic selection
  const route = selectModel({
    channel: options?.channel ?? "web",
    toolCount: options?.toolCount ?? 0,
    messageCount: options?.messageCount ?? 0,
  });
  return {
    primaryModel: route.primary,
    fallbackModels: route.fallbacks,
    tier: route.tier,
    reason: route.reason,
    resolveMode: "router",
  };
}

function estimateContextTokens(messages: Message[]): number {
  const totalChars = messages.reduce((acc, message) => acc + message.content.length, 0);
  return Math.max(1, Math.ceil(totalChars / 4));
}

function logModelGenerationStarted(
  mode: "non_streaming" | "streaming",
  payload: {
    providerMode: string;
    resolveMode: string;
    routeTier: ModelTier;
    routeReason: string;
    options?: GenerateOptions;
    context: {
      contextMessageCount: number;
      contextTokenEstimate: number;
      shouldCompact?: boolean;
      shouldBlock?: boolean;
      activeToolCount: number;
      systemPromptChars: number;
    };
    primaryModel: string;
    fallbackModels: string[];
    messageCount: number;
  },
) {
  const policyFingerprint = payload.options?.policyFingerprint ?? "default";
  const policyMergeSource = payload.options?.policyMergeSource ?? "default";

  void logger.info("agent.model.generate.started", {
    model: payload.primaryModel,
    primaryModel: payload.primaryModel,
    fallbackModels: payload.fallbackModels,
    mode,
    channel: payload.options?.channel,
    messageCount: payload.messageCount,
    conversationId: payload.options?.conversationId,
    jobId: payload.options?.jobId,
    contextMessageCount: payload.context.contextMessageCount,
    contextTokenEstimate: payload.context.contextTokenEstimate,
    shouldCompact: payload.context.shouldCompact,
    shouldBlock: payload.context.shouldBlock,
    systemPromptChars: payload.context.systemPromptChars,
    activeToolCount: payload.context.activeToolCount,
    policyFingerprint,
    policyMergeSource,
    routeTier: payload.routeTier,
    routeReason: payload.routeReason,
    providerMode: payload.providerMode,
    resolveMode: payload.resolveMode,
  });
}

function logModelGenerationCompleted(
  mode: "non_streaming" | "streaming" | "stream_consumed",
  payload: {
    providerMode: string;
    routeTier: ModelTier;
    context: {
      contextMessageCount: number;
      contextTokenEstimate: number;
    };
    options?: GenerateOptions;
    modelUsed: string;
    startedAt: number;
    fallbackAttempt: number;
    attemptedModels: string[];
  },
) {
  void logger.info("agent.model.generate.completed", {
    model: payload.modelUsed,
    modelUsed: payload.modelUsed,
    mode,
    channel: payload.options?.channel,
    conversationId: payload.options?.conversationId,
    jobId: payload.options?.jobId,
    providerMode: payload.providerMode,
    routeTier: payload.routeTier,
    fallbackAttempt: payload.fallbackAttempt,
    attemptedModels: payload.attemptedModels,
    contextMessageCount: payload.context.contextMessageCount,
    contextTokenEstimate: payload.context.contextTokenEstimate,
    durationMs: Date.now() - payload.startedAt,
  });
}

function processModelResult(contentMessages: {
  steps: Array<{
    toolCalls: Array<{ toolName: string; toolCallId: string; input: unknown }>;
    toolResults: Array<{ toolCallId: string; output: unknown }>;
  }>;
  text: string;
}) {
  const allToolCalls = contentMessages.steps.flatMap((step) => step.toolCalls);
  const allToolResults = contentMessages.steps.flatMap((step) => step.toolResults);

  const resultsByCallId = new Map(allToolResults.map((tr) => [tr.toolCallId, tr.output]));

  const toolCalls = allToolCalls.map((tc) => ({
    name: tc.toolName,
    input: tc.input,
    output: resultsByCallId.get(tc.toolCallId),
  }));

  return {
    content: contentMessages.text,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

function validateRequiredFields(value: unknown, requiredFields?: string[]): string[] {
  if (!requiredFields || requiredFields.length === 0) return [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [`requiredFields=${requiredFields.join(", ")} requires object output`];
  }

  const missingFields = requiredFields.filter((field) => !(field in value));
  return missingFields.map((field) => `missing required field "${field}"`);
}

function describeToolContractViolation(toolName: string, reasons: string[]): string {
  return `Tool output contract warning for "${toolName}": ${reasons.join(" | ")}`;
}

function safeToJsonText(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function validateOutputContractValue(
  output: unknown,
  descriptor: PluginToolDescriptor | undefined,
): string[] {
  if (!descriptor?.outputContract) return [];
  const outputContract = descriptor.outputContract;
  if (outputContract.requiresStructuredOutput === false) return [];

  const reasons: string[] = [];
  const shape = outputContract.outputShape;

  if (shape === "string" || shape === "markdown") {
    if (typeof output !== "string") reasons.push("output was not a string");
    return reasons;
  }

  if (shape === "json") {
    if (typeof output === "string") {
      try {
        output = JSON.parse(output.trim());
      } catch {
        reasons.push("output could not be parsed as JSON");
        return reasons;
      }
    }

    if (typeof output !== "object" || output === null) {
      reasons.push("output was not a valid JSON value");
      return reasons;
    }

    return [...reasons, ...validateRequiredFields(output, outputContract.requiredFields)];
  }

  if (shape === "json-lines") {
    if (typeof output !== "string") {
      reasons.push("json-lines output must be a newline-delimited string");
      return reasons;
    }

    const lines = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      reasons.push("json-lines output was empty");
      return reasons;
    }

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        reasons.push(...validateRequiredFields(parsed, outputContract.requiredFields));
      } catch {
        reasons.push(`line not valid JSON: ${line}`);
      }
    }
  }

  return reasons;
}

function applyToolContractValidation(
  toolCalls: ToolCallRecord[],
  toolContracts?: PluginToolDescriptorMap,
): { toolCalls: ToolCallRecord[]; violations: ToolContractValidation[] } {
  if (!toolContracts || Object.keys(toolContracts).length === 0 || toolCalls.length === 0) {
    return { toolCalls, violations: [] };
  }

  const violations: ToolContractValidation[] = [];
  const normalized: ToolCallRecord[] = [];

  for (const call of toolCalls) {
    const descriptor = toolContracts?.[call.name];
    const validation = validateOutputContractValue(call.output, descriptor);

    if (validation.length === 0) {
      normalized.push(call);
      continue;
    }

    violations.push({ toolName: call.name, reasons: validation });
    const warningSummary = describeToolContractViolation(call.name, validation);
    normalized.push({
      ...call,
      output: `${safeToJsonText(call.output)}\n\n⚠️ ${warningSummary}`,
    });
  }

  return { toolCalls: normalized, violations };
}

function logToolContractViolations(
  violations: ToolContractValidation[],
  context?: ToolContractContext,
): void {
  if (violations.length === 0) return;
  for (const violation of violations) {
    void logger.warn("agent.model.tool_output.contract_violation", {
      conversationId: context?.conversationId,
      jobId: context?.jobId,
      channel: context?.channel,
      toolName: violation.toolName,
      warning: violation.reasons,
    });
  }
}

export async function generateResponse(
  conversationMessages: Message[],
  skills?: Skill[],
  options?: GenerateOptions,
): Promise<GenerateResult> {
  const startedAt = Date.now();
  const provider = await getAIProvider();
  const useStreaming = provider.mode === "openai_subscription";
  const { primaryModel, fallbackModels, tier, reason, resolveMode } = resolveModels(options);
  const contextMessageCount = options?.contextMessageCount ?? conversationMessages.length;
  const contextTokenEstimate =
    options?.contextTokenEstimate ?? estimateContextTokens(conversationMessages);
  const isNewNoteRequest = isLikelyNewNoteRequest(conversationMessages);
  const resolvedNoteContext = isNewNoteRequest ? undefined : options?.noteContext;
  if (options?.conversationId && options?.noteContext && isNewNoteRequest) {
    void logger.debug("agent.model.generate.note_context_reset", {
      conversationId: options.conversationId,
      jobId: options.jobId,
      channel: options.channel,
      reason: "new_note_request_detected",
    });
  }
  const systemPrompt = buildSystemPrompt(
    skills,
    options?.agentConfig,
    options?.channel,
    resolvedNoteContext,
  );

  logModelGenerationStarted("non_streaming", {
    providerMode: provider.mode,
    resolveMode,
    routeTier: tier,
    routeReason: reason,
    options,
    context: {
      contextMessageCount,
      contextTokenEstimate,
      shouldCompact: options?.shouldCompact,
      shouldBlock: options?.shouldBlock,
      activeToolCount: options?.toolCount ?? 0,
      systemPromptChars: systemPrompt.length,
    },
    primaryModel,
    fallbackModels,
    messageCount: conversationMessages.length,
  });

  const { result, modelUsed, fallbackAttempt, attemptedModels } = await runWithFallback({
    primaryModel,
    fallbackModels,
    run: async (modelName) => {
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
          return processModelResult({ steps, text });
        }
        const gen = await generateText({ ...callOptions, tools: toolsToUse });
        return processModelResult({ steps: gen.steps, text: gen.text });
      };

      const executeWithValidation = async (toolsToUse: Record<string, Tool>) => {
        const modelResult = await execute(toolsToUse);
        const withValidation = applyToolContractValidation(
          modelResult.toolCalls ?? [],
          options?.toolContracts,
        );
        logToolContractViolations(withValidation.violations, {
          conversationId: options?.conversationId,
          jobId: options?.jobId,
          channel: options?.channel,
        });
        return {
          ...modelResult,
          ...withValidation,
        };
      };

      try {
        return await executeWithValidation(resolvedTools);
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

        return executeWithValidation(removeProviderSearchTools(resolvedTools));
      }
    },
  });

  logModelGenerationCompleted("non_streaming", {
    providerMode: provider.mode,
    routeTier: tier,
    context: {
      contextMessageCount,
      contextTokenEstimate,
    },
    options,
    modelUsed,
    startedAt,
    fallbackAttempt,
    attemptedModels,
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
  const provider = await getAIProvider();
  const { primaryModel, fallbackModels, tier, reason, resolveMode } = resolveModels(options);
  const contextMessageCount = options?.contextMessageCount ?? conversationMessages.length;
  const contextTokenEstimate =
    options?.contextTokenEstimate ?? estimateContextTokens(conversationMessages);
  const isNewNoteRequest = isLikelyNewNoteRequest(conversationMessages);
  const resolvedNoteContext = isNewNoteRequest ? undefined : options?.noteContext;
  if (options?.conversationId && options?.noteContext && isNewNoteRequest) {
    void logger.debug("agent.model.generate.note_context_reset", {
      conversationId: options.conversationId,
      jobId: options.jobId,
      channel: options.channel,
      reason: "new_note_request_detected",
    });
  }
  const streamSystemPrompt = buildSystemPrompt(
    skills,
    options?.agentConfig,
    options?.channel,
    resolvedNoteContext,
  );

  logModelGenerationStarted("streaming", {
    providerMode: provider.mode,
    resolveMode,
    routeTier: tier,
    routeReason: reason,
    options,
    context: {
      contextMessageCount,
      contextTokenEstimate,
      shouldCompact: options?.shouldCompact,
      shouldBlock: options?.shouldBlock,
      activeToolCount: options?.toolCount ?? 0,
      systemPromptChars: streamSystemPrompt.length,
    },
    primaryModel,
    fallbackModels,
    messageCount: conversationMessages.length,
  });

  const { result, modelUsed, fallbackAttempt, attemptedModels } = await runWithFallback({
    primaryModel,
    fallbackModels,
    run: async (modelName) => {
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
        return processModelResult({ steps, text });
      };

      const executeWithValidation = async (toolsToUse: Record<string, Tool>) => {
        const modelResult = await executeStream(toolsToUse);
        const withValidation = applyToolContractValidation(
          modelResult.toolCalls ?? [],
          options?.toolContracts,
        );
        logToolContractViolations(withValidation.violations, {
          conversationId: options?.conversationId,
          jobId: options?.jobId,
          channel: options?.channel,
        });
        return {
          ...modelResult,
          ...withValidation,
        };
      };

      try {
        return await executeWithValidation(resolvedTools);
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

        return executeWithValidation(removeProviderSearchTools(resolvedTools));
      }
    },
  });

  logModelGenerationCompleted("streaming", {
    providerMode: provider.mode,
    routeTier: tier,
    context: {
      contextMessageCount,
      contextTokenEstimate,
    },
    options,
    modelUsed,
    startedAt,
    fallbackAttempt,
    attemptedModels,
  });
  return { ...result, modelUsed };
}
