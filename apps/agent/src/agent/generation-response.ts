import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";

import { logger } from "../observability/logger";
import { friendlyModelName } from "./model-names";
import { sanitizeForWhatsApp, stripModelAndToolFooter } from "./whatsapp-format";

interface NoteCreationSummary {
  noteId: string;
  title: string;
  source: string;
}

interface NoteCreationFailure {
  toolName: string;
  reason: string;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  output?: unknown;
}

interface ModelTelemetry {
  rawFinishReason?: string;
  finishReason?: string;
  usage?: unknown;
  totalUsage?: unknown;
}

const NOTE_TOOL_NAMES = [
  "note_list",
  "note_get",
  "note_create",
  "note_update",
  "note_move",
  "note_archive",
  "note_generate_from_conversation",
  "note_transform",
  "note_apply_transform",
  "note_update_from_ai",
] as const;

const NOTE_TOOL_NAME_SET = new Set<string>(NOTE_TOOL_NAMES);

const NOTE_CREATION_TOOL_NAMES = ["note_create", "note_generate_from_conversation"] as const;
const NOTE_CREATION_TOOL_SET = new Set<string>(NOTE_CREATION_TOOL_NAMES);

function stripCodeFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (!fenced || !fenced[1]) return raw;
  return fenced[1]!;
}

function parseNoteCreateOutputRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function parseNoteCreationFromToolOutput(output: unknown): NoteCreationSummary | undefined {
  let parsed: Record<string, unknown> | undefined;

  if (typeof output === "string") {
    const cleaned = stripCodeFences(output).trim();
    const parseCandidate = (candidate: string): Record<string, unknown> | undefined => {
      const trimmed = candidate.trim();
      if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
      try {
        return JSON.parse(trimmed) as unknown as Record<string, unknown>;
      } catch {
        return undefined;
      }
    };

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    const fallbackPayload =
      firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : "";
    parsed = parseCandidate(cleaned) ?? parseCandidate(fallbackPayload);
    if (!parsed) return undefined;
  } else {
    parsed = parseNoteCreateOutputRecord(output);
  }

  if (!parsed) return undefined;
  const action = typeof parsed.action === "string" ? parsed.action : "";
  const noteId = typeof parsed.noteId === "string" ? parsed.noteId.trim() : "";
  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  if (action !== "note_created" || !noteId || !title) return undefined;

  return {
    noteId,
    title,
    source: typeof parsed.source === "string" ? parsed.source : "chat-generated",
  };
}

export function parseNoteCreationFailure(
  output: unknown,
  toolName = "note_create",
): NoteCreationFailure | undefined {
  const asRecord = parseNoteCreateOutputRecord(output);
  if (asRecord) {
    const reason =
      typeof asRecord.error === "string"
        ? asRecord.error
        : typeof asRecord.reason === "string"
          ? asRecord.reason
          : typeof asRecord.message === "string"
            ? asRecord.message
            : undefined;

    if (reason) {
      return {
        toolName,
        reason: reason.trim(),
      };
    }
  }

  if (typeof output !== "string") return undefined;
  const reasonMatch =
    output.match(
      /(?:Could not complete note action|Could not create note|Failed to create note)[:\s-]+(.+)$/i,
    ) ?? output.match(/error[:\s]+(.+)$/i);
  if (!reasonMatch) return undefined;

  return {
    toolName,
    reason: reasonMatch[1]?.trim() ?? "Unknown error",
  };
}

export function resolveNoteCreationOutcomes(toolCalls: ToolCallRecord[] | undefined) {
  if (!toolCalls || toolCalls.length === 0) {
    return { successes: [] as NoteCreationSummary[], failures: [] as NoteCreationFailure[] };
  }

  const successes: NoteCreationSummary[] = [];
  const failures: NoteCreationFailure[] = [];

  for (const toolCall of toolCalls) {
    if (!NOTE_CREATION_TOOL_SET.has(toolCall.name)) continue;
    const success = parseNoteCreationFromToolOutput(toolCall.output);
    if (success) {
      successes.push(success);
      continue;
    }
    const failure = parseNoteCreationFailure(toolCall.output, toolCall.name);
    failures.push(
      failure ?? {
        toolName: toolCall.name,
        reason: "Tool output did not confirm note creation.",
      },
    );
  }

  return { successes, failures };
}

function resolveNoteCreationSummaries(
  toolCalls: ToolCallRecord[] | undefined,
): NoteCreationSummary[] {
  if (!toolCalls || toolCalls.length === 0) return [];
  const entries: NoteCreationSummary[] = [];
  for (const toolCall of toolCalls) {
    if (!NOTE_CREATION_TOOL_SET.has(toolCall.name)) continue;
    const summary = parseNoteCreationFromToolOutput(toolCall.output);
    if (summary) entries.push(summary);
  }
  return entries;
}

export interface ToolCallSummary {
  totalCalls: number;
  uniqueToolCount: number;
  noteToolCalls: number;
  toolCountByName: Record<string, number>;
  noteTools: string[];
}

export function summarizeToolCalls(toolCalls: ToolCallRecord[] | undefined): ToolCallSummary {
  const calls = toolCalls ?? [];
  const toolCountByName: Record<string, number> = {};

  for (const toolCall of calls) {
    toolCountByName[toolCall.name] = (toolCountByName[toolCall.name] ?? 0) + 1;
  }

  const noteTools = calls
    .filter((toolCall) => NOTE_TOOL_NAME_SET.has(toolCall.name))
    .map((toolCall) => toolCall.name);

  return {
    totalCalls: calls.length,
    uniqueToolCount: Object.keys(toolCountByName).length,
    noteToolCalls: noteTools.length,
    toolCountByName,
    noteTools,
  };
}

export function buildNoteCreationReply(
  toolCalls: ToolCallRecord[] | undefined,
  channel: "web" | "whatsapp" | "telegram",
  explicitOutcomes?: { successes: NoteCreationSummary[]; failures: NoteCreationFailure[] },
): string | undefined {
  const summaryFromOutcomes = explicitOutcomes ?? {
    successes: resolveNoteCreationSummaries(toolCalls),
    failures: [],
  };
  const summaries = summaryFromOutcomes.successes;

  const hasCreateAttempt = (toolCalls ?? []).some((toolCall) =>
    NOTE_CREATION_TOOL_SET.has(toolCall.name),
  );
  if (!summaries.length && !hasCreateAttempt) {
    return undefined;
  }
  if (!summaries.length) {
    const reasons = summaryFromOutcomes.failures.map((failure) => failure.reason).join(" | ");
    const fallbackReason =
      reasons.length > 0 ? reasons : "Tool output did not confirm note creation.";
    return `Could not create note: ${fallbackReason}`;
  }

  if (channel === "whatsapp") {
    return `Created note${summaries.length > 1 ? "s" : ""}: ${summaries.map(({ title }) => title).join(", ")}.`;
  }

  const links = summaries.map(({ noteId, title }) => `[${title}](/notes/${noteId})`).join("\n");
  return `Created note(s):\n${links}`;
}

export function buildNoteToolFallbackReply(
  toolCalls: ToolCallRecord[] | undefined,
): string | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;

  const hasNoteTransform = toolCalls.some((toolCall) => toolCall.name === "note_transform");
  const hasNoteApply = toolCalls.some(
    (toolCall) =>
      toolCall.name === "note_apply_transform" || toolCall.name === "note_update_from_ai",
  );

  if (!toolCalls.some((toolCall) => NOTE_TOOL_NAME_SET.has(toolCall.name))) {
    return undefined;
  }

  if (hasNoteApply) {
    return "I applied an AI note update. Check tool details for what changed.";
  }

  if (hasNoteTransform) {
    return "I prepared a note transformation. Open Tool call details and apply the suggestion when you’re ready.";
  }

  return "I completed a note action. Open Tool call details for the results.";
}

interface ToolContractContext {
  conversationId?: Id<"conversations">;
  jobId?: Id<"agentQueue">;
  channel?: "web" | "whatsapp" | "telegram";
}

export function logToolCallSummary(
  toolCalls: ToolCallRecord[] | undefined,
  context: {
    conversationId: Id<"conversations">;
    jobId: Id<"agentQueue">;
    channel: "web" | "whatsapp" | "telegram";
    modelUsed?: string;
    generationMode: "streaming" | "non_streaming";
    shouldCompact: boolean;
    shouldBlock: boolean;
    toolCount: number;
    contextTokenEstimate?: number;
    modelTelemetry?: ModelTelemetry;
    toolContracts?: ToolContractContext;
  },
) {
  const summary = summarizeToolCalls(toolCalls);
  const outcomes = resolveNoteCreationOutcomes(toolCalls);
  void logger.info("agent.loop.tool_calls", {
    ...context,
    totalToolCalls: summary.totalCalls,
    uniqueToolCount: summary.uniqueToolCount,
    noteToolCalls: summary.noteToolCalls,
    noteTools: summary.noteTools,
    noteCreationSuccessCount: outcomes.successes.length,
    noteCreationFailureCount: outcomes.failures.length,
    noteCreationFailures: outcomes.failures,
    toolCountByName: summary.toolCountByName,
    modelTelemetry: context.modelTelemetry,
  });
}

export function estimateContextTokens(messages: { content: string }[]): number {
  const charCount = messages.reduce((acc, message) => acc + message.content.length, 0);
  return Math.max(1, Math.ceil(charCount / 4));
}

export interface ComposeAssistantResponseOptions {
  channel: "web" | "whatsapp" | "telegram";
  toolCalls: ToolCallRecord[] | undefined;
  assistantContent: string;
  modelUsed?: string;
  preferences?: {
    showModelInfo?: boolean;
    showToolDetails?: boolean;
  };
}

export interface ComposeAssistantResponseResult {
  noteCreationMessage?: string;
  noteCreationOutcomes: { successes: NoteCreationSummary[]; failures: NoteCreationFailure[] };
  toolFallback?: string;
  assistantContent: string;
  content: string;
}

export function composeAssistantResponse(
  options: ComposeAssistantResponseOptions,
): ComposeAssistantResponseResult {
  const noteCreationOutcomes = resolveNoteCreationOutcomes(options.toolCalls);
  const noteCreationMessage = buildNoteCreationReply(
    options.toolCalls,
    options.channel,
    noteCreationOutcomes,
  );
  const toolFallback =
    options.assistantContent.trim() === ""
      ? buildNoteToolFallbackReply(options.toolCalls)
      : undefined;
  const assistantContent = options.assistantContent;
  const baseContent = noteCreationMessage
    ? noteCreationMessage
    : options.channel === "whatsapp"
      ? sanitizeForWhatsApp(toolFallback ?? assistantContent)
      : (toolFallback ?? assistantContent);

  let content = baseContent;
  if (options.channel === "whatsapp" && !noteCreationMessage) {
    const metadata = formatAssistantMetadata({
      toolCalls: options.toolCalls ?? [],
      modelUsed: options.modelUsed,
      preferences: options.preferences,
    });
    if (metadata) {
      content = `${stripModelAndToolFooter(content)}\n\n${metadata}`;
    }
  }

  return {
    noteCreationMessage,
    noteCreationOutcomes,
    toolFallback,
    assistantContent,
    content,
  };
}

function formatAssistantMetadata(params: {
  toolCalls: ToolCallRecord[];
  modelUsed?: string;
  preferences?: {
    showModelInfo?: boolean;
    showToolDetails?: boolean;
  };
}): string | undefined {
  if (!params.preferences) return undefined;
  const parts: string[] = [];
  if (params.preferences.showModelInfo && params.modelUsed) {
    parts.push(`Model: ${friendlyModelName(params.modelUsed)}`);
  }
  if (params.preferences.showToolDetails && params.toolCalls.length) {
    const counts = new Map<string, number>();
    for (const toolCall of params.toolCalls) {
      counts.set(toolCall.name, (counts.get(toolCall.name) ?? 0) + 1);
    }
    const summary = [...counts.entries()]
      .map(([name, count]) => (count > 1 ? `${name} x${count}` : name))
      .join(", ");
    parts.push(`Tools: ${summary}`);
  }
  if (parts.length === 0) return undefined;
  return `_${parts.join(" | ")}_`;
}
