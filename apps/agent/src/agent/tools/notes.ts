import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { env } from "@zenthor-assist/env/agent";
import { tool } from "ai";
import { z } from "zod";

import { getConvexClient } from "../../convex/client";
import { logger } from "../../observability/logger";

const listNotesInput = z.object({
  folderId: z.string().optional().describe("Note folder ID to scope results"),
  isArchived: z.boolean().optional().describe("Filter archived notes"),
  limit: z.number().min(1).max(200).optional().describe("Max notes to return"),
});

const getNoteInput = z.object({
  noteId: z.string().describe("The note ID"),
});

const createNoteInput = z.object({
  title: z.string().describe("Note title"),
  content: z.string().describe("Note content"),
  folderId: z.string().optional().describe("Optional folder ID"),
  source: z.enum(["manual", "chat-generated", "imported"]).optional().describe("Note source"),
});

const updateNoteInput = z.object({
  noteId: z.string().describe("The note ID"),
  title: z.string().optional().describe("New title"),
  content: z.string().optional().describe("New content"),
  folderId: z.string().optional().describe("Move to this folder ID"),
  isArchived: z.boolean().optional().describe("Archive state"),
  metadata: z.record(z.string(), z.unknown()).optional().describe("Any metadata to store"),
});

const moveNoteInput = z.object({
  noteId: z.string().describe("The note ID"),
  folderId: z.string().optional().describe("Target folder ID"),
});

const archiveNoteInput = z.object({
  noteId: z.string().describe("The note ID"),
  isArchived: z.boolean().default(true).describe("Whether note is archived"),
});

const generateFromConversationInput = z.object({
  title: z.string().describe("Suggested title for the generated note"),
  folderId: z.string().optional().describe("Optional folder ID"),
  source: z.enum(["manual", "chat-generated", "imported"]).optional().describe("Source label"),
  messageLimit: z.number().min(10).max(240).default(80).describe("Recent message count"),
});

const noteTransformInput = z.object({
  noteId: z.string().describe("The note ID"),
  intent: z
    .enum(["organize", "rewrite", "expand", "summarize", "extract", "translate", "clean-style"])
    .describe("Requested transformation intent"),
  tone: z.string().optional().describe("Optional tone for rewrite/clean-style"),
  language: z.string().optional().describe("Optional target language for extract/translate"),
});

type NoteIntent = z.infer<typeof noteTransformInput>["intent"];

const applyTransformInput = z.object({
  noteId: z.string().describe("The note ID"),
  resultText: z.string().describe("Note content to persist"),
  operations: z.string().optional().describe("Optional serialized operation summary"),
});

function noteCreatedResult(noteId: string, title: string, source: string) {
  return JSON.stringify({
    action: "note_created",
    noteId,
    title,
    source,
  });
}

function sanitizeNoteToolOutput(message: string) {
  return message.replace(/\n+/g, " ").trim();
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

interface NoteToolContext {
  conversationId: Id<"conversations">;
  jobId?: Id<"agentQueue">;
}

interface NoteToolInvocation {
  [key: string]: unknown;
  invocationId: string;
  startedAt: number;
  toolName: string;
  conversationId: Id<"conversations">;
  jobId?: Id<"agentQueue">;
}

function makeInvocationId(toolName: string) {
  return `${toolName}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function beginNoteToolInvocation(
  toolName: string,
  context: NoteToolContext,
  extra?: Record<string, unknown>,
) {
  const invocation: NoteToolInvocation = {
    invocationId: makeInvocationId(toolName),
    startedAt: Date.now(),
    toolName,
    conversationId: context.conversationId,
    ...(context.jobId ? { jobId: context.jobId } : {}),
  };
  if (extra) {
    Object.assign(invocation, extra);
  }
  void logger.info("agent.notes.tool.request.started", invocation);
  return invocation;
}

function finalizeNoteToolInvocation(
  invocation: NoteToolInvocation,
  outcome: "succeeded" | "validation_failed" | "failed",
  extra?: Record<string, unknown>,
) {
  const payload: NoteToolInvocation & { outcome: string; durationMs: number } = {
    ...invocation,
    outcome,
    durationMs: Date.now() - invocation.startedAt,
  };
  if (extra) {
    Object.assign(payload, extra);
  }
  void logger.info("agent.notes.tool.request.outcome", payload);
}

function logNoteToolError(toolName: string, context: NoteToolContext, error: unknown) {
  void logger.exception("agent.notes.tool.request.exception", error, {
    toolName,
    conversationId: context.conversationId,
    ...(context.jobId ? { jobId: context.jobId } : {}),
  });
}

function summarizeForLog(value: string, maxLength = 260) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function logEmptyNoteContent(toolName: string, context: NoteToolContext, content: string) {
  void logger.warn("agent.notes.tool.empty_content", {
    toolName,
    conversationId: context.conversationId,
    ...(context.jobId ? { jobId: context.jobId } : {}),
    rawLength: content.length,
    renderedPreview: content.trim().slice(0, 200),
  });
}

const EMPTY_NOTE_TOOL_MESSAGE = "Could not complete note action: note content is empty.";

function stripInvisibleText(value: string) {
  const namedInvisibleEntities = new Set([
    "nbsp",
    "ensp",
    "emsp",
    "thinsp",
    "zwnj",
    "zwj",
    "lrm",
    "rlm",
  ]);
  const namedEntityPattern = /&(?:amp;)?([a-zA-Z]+);?/g;
  const numericEntityPattern = /&(?:amp;)?#(x[0-9a-fA-F]+|\d+);?/g;

  const decodedNamed = value.replace(namedEntityPattern, (match, entity: string) => {
    return namedInvisibleEntities.has(entity.toLowerCase()) ? " " : match;
  });

  const decodedNumeric = decodedNamed.replace(numericEntityPattern, (_match, codeValue: string) => {
    const decoded =
      codeValue.startsWith("x") || codeValue.startsWith("X")
        ? Number.parseInt(codeValue.slice(1), 16)
        : Number.parseInt(codeValue, 10);
    if (Number.isNaN(decoded)) return _match;

    if (
      decoded === 0x00a0 ||
      decoded === 0x180e ||
      decoded === 0x2000 ||
      decoded === 0x2001 ||
      decoded === 0x2002 ||
      decoded === 0x2003 ||
      decoded === 0x2004 ||
      decoded === 0x2005 ||
      decoded === 0x2006 ||
      decoded === 0x2007 ||
      decoded === 0x2008 ||
      decoded === 0x2009 ||
      decoded === 0x200a ||
      decoded === 0x200b ||
      decoded === 0x200c ||
      decoded === 0x200d ||
      decoded === 0x2028 ||
      decoded === 0x2029 ||
      decoded === 0x202f ||
      decoded === 0x205f ||
      decoded === 0x2060 ||
      decoded === 0x3000 ||
      decoded === 0xfeff
    )
      return " ";

    return _match;
  });

  return decodedNumeric
    .replace(
      /[\u00A0\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\u180E\u200B-\u200D\u2060\uFEFF]/g,
      " ",
    )
    .trim();
}

const noteFolderIdPattern = /^[a-z0-9]{32}$/i;
const noteIdPattern = /^[a-z0-9]{32}$/i;

type NoteFolderIdNormalization = {
  value: Id<"noteFolders"> | undefined;
  wasSanitized: boolean;
  reason?: "empty" | "invalid-format";
  rawValue?: string;
};

function normalizeNoteFolderId(folderId?: string): NoteFolderIdNormalization {
  const normalized = cleanText(folderId);
  if (folderId === undefined) return { value: undefined, wasSanitized: false };
  if (!normalized) return { value: undefined, wasSanitized: true, reason: "empty" };
  if (!noteFolderIdPattern.test(normalized)) {
    return {
      value: undefined,
      wasSanitized: true,
      reason: "invalid-format",
      rawValue: normalized,
    };
  }
  return { value: normalized as Id<"noteFolders">, wasSanitized: false };
}

type FolderIdResolution = {
  value: Id<"noteFolders"> | undefined;
  warning?: string;
};

type NoteIdResolution = {
  value: Id<"notes"> | undefined;
  error?: string;
};

function resolveNoteFolderId(
  conversationId: Id<"conversations">,
  toolName: string,
  folderId?: string,
  context?: Pick<NoteToolContext, "jobId">,
): FolderIdResolution {
  const normalized = normalizeNoteFolderId(folderId);
  if (!normalized.wasSanitized) return { value: normalized.value };

  void logger.warn("agent.notes.tool.folder_id_sanitized", {
    toolName,
    conversationId,
    reason: normalized.reason ?? "invalid-format",
    rawFolderId: normalized.rawValue ?? folderId,
    ...(context?.jobId ? { jobId: context.jobId } : {}),
  });

  const warning =
    normalized.reason === "empty"
      ? "(Note: provided folder ID was empty and was ignored.)"
      : `(Note: folder ID "${normalized.rawValue ?? folderId}" was not recognized; operation proceeded without a folder.)`;

  return { value: undefined, warning };
}

function resolveNoteId(
  conversationId: Id<"conversations">,
  toolName: string,
  noteId: string,
  context?: Pick<NoteToolContext, "jobId">,
): NoteIdResolution {
  const normalized = cleanText(noteId);
  if (!normalized) {
    return { value: undefined, error: "Note ID is required." };
  }

  if (!noteIdPattern.test(normalized)) {
    void logger.warn("agent.notes.tool.note_id_invalid", {
      toolName,
      conversationId,
      rawNoteId: noteId,
      ...(context?.jobId ? { jobId: context.jobId } : {}),
    });
    return {
      value: undefined,
      error:
        "The provided note ID is not valid. Use the exact note ID returned by note_list or note_get.",
    };
  }

  return { value: normalized as Id<"notes">, error: undefined };
}

function summarizeText(content: string, maxChars = 500) {
  return content.length <= maxChars ? content : `${content.slice(0, maxChars)}…`;
}

function toNoteResult(note: {
  _id: Id<"notes">;
  title: string;
  content: string;
  isArchived: boolean;
  folderId?: Id<"noteFolders">;
}) {
  const plainContent = cleanText(stripHtmlTags(note.content));
  const preview = plainContent ? summarizeText(plainContent, 240) : "(empty)";
  return `${note.title} (${note._id}) — archived: ${note.isArchived ? "yes" : "no"}${note.folderId ? ` · folder: ${note.folderId}` : ""}\n${preview}`;
}

function formatMessagesForNote(
  conversationMessages: Array<{ role: string; content: string }>,
  limit = 80,
) {
  return conversationMessages
    .slice(-limit)
    .map((message) => `- ${message.role}: ${cleanText(message.content)}`)
    .filter((line) => line.length > 5)
    .join("\n");
}

function applyIntentTransform(content: string, intent: NoteIntent, tone = "", language = "") {
  const normalized = cleanText(stripHtmlTags(content));
  if (intent === "summarize") {
    const lines = normalized.split("\n").filter(Boolean);
    return {
      resultText: `Summary:\n${lines.slice(0, 8).join("\n")}`,
      operations: "summarize-content-blocks",
    };
  }

  if (intent === "extract") {
    const bullets = normalized
      .split(/\n+/)
      .map((line) => `- ${line.trim()}`)
      .filter((line) => line.length > 2)
      .join("\n");
    return {
      resultText: `## Extracted Items\n${bullets || "- No extractable items."}`,
      operations: "extract-key-items",
    };
  }

  if (intent === "expand") {
    return {
      resultText: `${normalized}\n\n## Expansion\nConsider adding examples, examples of impact, and a concise action list.`,
      operations: "append-expansion-block",
    };
  }

  if (intent === "rewrite") {
    const direction = tone ? ` in ${tone} tone` : "";
    return {
      resultText: `## Rewritten${direction}\n${normalized}`,
      operations: "rewrite-style",
    };
  }

  if (intent === "clean-style") {
    return {
      resultText: `## Cleaned${tone ? ` (${tone})` : ""}\n${normalized}`,
      operations: `clean-style${tone ? `:${tone}` : ""}`,
    };
  }

  if (intent === "translate" && language) {
    return {
      resultText: `[${language}] ${normalized}`,
      operations: "translate-simulated",
    };
  }

  return {
    resultText: normalized,
    operations: `apply-${intent}`,
  };
}

function stripHtmlTags(value: string) {
  return value.replace(/<[^>]+>/g, "");
}

function escapeNoteHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type TiptapMark = {
  type: "bold" | "italic" | "strike" | "code";
  attrs?: {
    href?: string;
    [key: string]: unknown;
  };
};

type TiptapNode = {
  type?: string;
  content?: unknown[];
  text?: string;
  attrs?: {
    level?: number;
    href?: string;
    [key: string]: unknown;
  };
  marks?: TiptapMark[];
};

function renderTiptapText(raw: string, marks: TiptapMark[] = []) {
  const hasBold = marks.some((mark) => mark.type === "bold");
  const hasItalic = marks.some((mark) => mark.type === "italic");
  const hasStrike = marks.some((mark) => mark.type === "strike");
  const hasCode = marks.some((mark) => mark.type === "code");

  const content = escapeNoteHtml(raw);
  const wrappedCode = hasCode ? `<code>${content}</code>` : content;
  const wrappedStrike = hasStrike ? `<s>${wrappedCode}</s>` : wrappedCode;
  const wrappedItalic = hasItalic ? `<em>${wrappedStrike}</em>` : wrappedStrike;
  return hasBold ? `<strong>${wrappedItalic}</strong>` : wrappedItalic;
}

function getTiptapNodes(value: unknown): TiptapNode[] {
  return Array.isArray(value)
    ? value.filter((node): node is TiptapNode => typeof node === "object" && node !== null)
    : [];
}

function renderTiptapNodes(nodes: unknown[]): string {
  return nodes.map(renderTiptapNode).join("");
}

function renderTiptapNode(node: unknown): string {
  if (typeof node !== "object" || node === null) return "";
  const typedNode = node as TiptapNode;

  if (typeof typedNode.text === "string") {
    return renderTiptapText(typedNode.text, typedNode.marks ?? []);
  }

  const children = typedNode.content ? renderTiptapNodes(typedNode.content) : "";
  if (!typedNode.type) return children;

  if (typedNode.type === "doc") return children;
  if (typedNode.type === "text") return "";
  if (typedNode.type === "paragraph") return `<p>${children}</p>`;
  if (typedNode.type === "heading") {
    const level = Math.min(Math.max(typedNode.attrs?.level ?? 1, 1), 6);
    return `<h${level}>${children}</h${level}>`;
  }
  if (typedNode.type === "bulletList") return `<ul>${children}</ul>`;
  if (typedNode.type === "orderedList") return `<ol>${children}</ol>`;
  if (typedNode.type === "listItem") return `<li>${children}</li>`;
  if (typedNode.type === "blockquote") return `<blockquote>${children}</blockquote>`;
  if (typedNode.type === "codeBlock") return `<pre><code>${children}</code></pre>`;
  if (typedNode.type === "horizontalRule") return "<hr />";
  if (typedNode.type === "hardBreak") return "<br />";
  if (typedNode.type === "image")
    return `<img src="${escapeNoteHtml(`${typedNode.attrs?.href ?? ""}`)}" />`;
  return children;
}

function toHtmlFromTiptap(value: string) {
  const parsed = parseUnknownObject(value);
  if (!parsed || (parsed.type !== "doc" && !Array.isArray(parsed.content))) return undefined;

  const nodes = getTiptapNodes(parsed.content);
  const html = nodes.map(renderTiptapNode).join("").trim();
  return html || "<p></p>";
}

function parseUnknownObject(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function hasRenderableText(html: string) {
  return stripInvisibleText(stripHtmlTags(html)) !== "";
}

function buildRenderableNoteContent(
  content: string,
  toolName: string,
  context: NoteToolContext,
  emptyMessage = EMPTY_NOTE_TOOL_MESSAGE,
) {
  const htmlContent = createNoteContent(content);
  if (hasRenderableText(htmlContent)) return { htmlContent };

  logEmptyNoteContent(toolName, context, content);
  return { error: emptyMessage };
}

function createNoteContent(content: string) {
  const converted = toHtmlFromTiptap(content);
  if (converted !== undefined) return converted;
  return toHtmlFromPlainText(content);
}

function toHtmlFromPlainText(value: string) {
  const normalized = cleanText(value).trim();
  if (!normalized) return "<p></p>";

  const lines = normalized.split(/\r?\n/);
  const output: string[] = [];
  const paragraphLines: string[] = [];
  let currentListType: "ol" | "ul" | undefined;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    const text = escapeNoteHtml(paragraphLines.join("\n")).replace(/\n/g, "<br />");
    output.push(`<p>${text}</p>`);
    paragraphLines.length = 0;
  };

  const closeList = (listType: "ol" | "ul", items: string[]) => {
    if (!items.length) return "";
    const tag = listType === "ol" ? "ol" : "ul";
    return `<${tag}>${items.map((item) => `<li>${item}</li>`).join("")}</${tag}>`;
  };

  const flushList = () => {
    if (!currentListType) return;
    const closed = closeList(currentListType, listItems);
    if (closed) output.push(closed);
    currentListType = undefined;
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    const bulletMatch = /^[-*+]\s+(.+)$/.exec(line);
    const orderedMatch = /^(\d+)\.\s+(.+)$/.exec(line);

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    if (headingMatch) {
      flushParagraph();
      flushList();
      const headingText = headingMatch[2] ?? "";
      const level = Math.min(headingMatch[1]!.length, 6);
      output.push(`<h${level}>${escapeNoteHtml(headingText)}</h${level}>`);
      continue;
    }

    if (bulletMatch || orderedMatch) {
      const markerType = orderedMatch ? "ol" : "ul";
      const text = escapeNoteHtml(
        orderedMatch ? (orderedMatch[2] ?? "") : (bulletMatch?.[1] ?? ""),
      );

      if (currentListType && currentListType !== markerType) {
        flushList();
      }
      if (!currentListType) currentListType = markerType;
      listItems.push(text);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return output.join("");
}

function getServiceError(message: string): string {
  if (message.includes("not linked to this conversation")) {
    return `Could not complete note action: ${message}. The note exists but is not linked to this chat. The user can open the note in the web app to edit it, or start a new conversation from the note's page.`;
  }
  if (message.includes("does not match note")) {
    return `Could not complete note action: ${message}. This note belongs to a different conversation. The user can open the note in the web app to edit it, or start a new conversation from the note's page.`;
  }
  return `Could not complete note action: ${message}`;
}

export function createNoteTools(context: NoteToolContext) {
  const { conversationId, jobId } = context;

  return {
    note_list: tool({
      description: "List notes visible in this conversation's workspace.",
      inputSchema: listNotesInput,
      execute: async ({ folderId, isArchived, limit }) => {
        const invocation = beginNoteToolInvocation("note_list", context, {
          folderIdLength: folderId?.length ?? 0,
          isArchived,
          limit,
        });
        try {
          const { value: resolvedFolderId, warning } = resolveNoteFolderId(
            conversationId,
            "note_list",
            folderId,
            { jobId },
          );
          const client = getConvexClient();
          const notes = await client.query(api.notes.listForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            folderId: resolvedFolderId,
            isArchived,
            limit,
          });
          const result = notes.length ? notes.map(toNoteResult).join("\n\n") : "No notes found.";
          finalizeNoteToolInvocation(invocation, "succeeded", {
            noteCount: notes.length,
            isArchived,
            ...(warning ? { warning } : {}),
          });
          return warning ? `${result}\n\n${warning}` : result;
        } catch (error) {
          finalizeNoteToolInvocation(invocation, "failed", {
            reason: error instanceof Error ? error.message : String(error),
          });
          logNoteToolError("note_list", context, error);
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_get: tool({
      description: "Get a note by ID from this user's workspace.",
      inputSchema: getNoteInput,
      execute: async ({ noteId }) => {
        const invocation = beginNoteToolInvocation("note_get", context, {
          noteIdLength: noteId.length,
        });
        try {
          const resolvedNoteId = resolveNoteId(conversationId, "note_get", noteId, { jobId });
          if (!resolvedNoteId.value) {
            const errorMessage = resolvedNoteId.error ?? "Invalid note ID.";
            finalizeNoteToolInvocation(invocation, "validation_failed", {
              reason: errorMessage,
            });
            return getServiceError(errorMessage);
          }

          const client = getConvexClient();
          const note = await client.query(api.notes.getForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            id: resolvedNoteId.value,
          });

          if (!note) {
            finalizeNoteToolInvocation(invocation, "failed", {
              reason: "Note not found.",
              noteId: resolvedNoteId.value,
            });
            return "Note not found.";
          }
          const plainContent = cleanText(stripHtmlTags(note.content));
          const contentSection = plainContent || "(empty — no content)";
          finalizeNoteToolInvocation(invocation, "succeeded", {
            noteId: note._id,
            contentLength: plainContent.length,
            contentPreview: summarizeForLog(contentSection, 320),
          });
          return `Title: ${note.title}\nID: ${note._id}\nArchived: ${note.isArchived}${note.folderId ? `\nFolder: ${note.folderId}` : ""}\nContent:\n${contentSection}`;
        } catch (error) {
          finalizeNoteToolInvocation(invocation, "failed", {
            reason: error instanceof Error ? error.message : String(error),
          });
          logNoteToolError("note_get", context, error);
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_create: tool({
      description: "Create a new note in the user's workspace.",
      inputSchema: createNoteInput,
      execute: async ({ title, content, folderId, source }) => {
        const invocation = beginNoteToolInvocation("note_create", context, {
          titleLength: title.length,
          contentLength: content.length,
          source,
          contentPreview: summarizeForLog(content),
        });
        try {
          const { value: resolvedFolderId, warning } = resolveNoteFolderId(
            conversationId,
            "note_create",
            folderId,
            { jobId },
          );
          const normalizedTitle = sanitizeNoteToolOutput(title);
          const renderableContent = buildRenderableNoteContent(content, "note_create", context);
          if ("error" in renderableContent) {
            finalizeNoteToolInvocation(invocation, "validation_failed", {
              reason: renderableContent.error,
            });
            return renderableContent.error;
          }
          const client = getConvexClient();
          const id = await client.mutation(api.notes.createForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            title: normalizedTitle,
            content: renderableContent.htmlContent,
            folderId: resolvedFolderId,
            source: source ?? "chat-generated",
          });
          finalizeNoteToolInvocation(invocation, "succeeded", {
            noteId: id,
            contentLength: renderableContent.htmlContent.length,
            titleLength: normalizedTitle.length,
            ...(warning ? { warning } : {}),
          });
          const result = noteCreatedResult(id, normalizedTitle, source ?? "chat-generated");
          return warning ? `${result}\n\n${warning}` : result;
        } catch (error) {
          finalizeNoteToolInvocation(invocation, "failed", {
            reason: error instanceof Error ? error.message : String(error),
          });
          logNoteToolError("note_create", context, error);
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_update: tool({
      description: "Update an existing note's title, content, folder, or archive status.",
      inputSchema: updateNoteInput,
      execute: async ({ noteId, title, content, folderId, isArchived, metadata }) => {
        const invocation = beginNoteToolInvocation("note_update", context, {
          noteIdLength: noteId.length,
          titleLength: title?.length,
          contentLength: content?.length,
          isArchived,
          hasMetadata: metadata !== undefined,
          folderIdLength: folderId?.length,
        });
        try {
          const resolvedNoteId = resolveNoteId(conversationId, "note_update", noteId, { jobId });
          if (!resolvedNoteId.value) {
            const errorMessage = resolvedNoteId.error ?? "Invalid note ID.";
            finalizeNoteToolInvocation(invocation, "validation_failed", {
              reason: errorMessage,
            });
            return getServiceError(errorMessage);
          }

          const { value: resolvedFolderId, warning } = resolveNoteFolderId(
            conversationId,
            "note_update",
            folderId,
            { jobId },
          );
          const renderableContent =
            content !== undefined
              ? buildRenderableNoteContent(content, "note_update", context)
              : undefined;
          if (renderableContent && "error" in renderableContent) {
            finalizeNoteToolInvocation(invocation, "validation_failed", {
              noteId: resolvedNoteId.value,
              reason: renderableContent.error,
            });
            return renderableContent.error;
          }
          const client = getConvexClient();
          await client.mutation(api.notes.updateForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            id: resolvedNoteId.value,
            title,
            content: renderableContent?.htmlContent,
            folderId: resolvedFolderId,
            isArchived,
            metadata,
          });
          const updatedFields: string[] = [];
          if (title !== undefined) updatedFields.push("title");
          if (content !== undefined) updatedFields.push("content");
          if (resolvedFolderId !== undefined) updatedFields.push("folder");
          if (isArchived !== undefined) updatedFields.push("archived");
          if (metadata !== undefined) updatedFields.push("metadata");
          const fieldsSummary = updatedFields.length
            ? ` (updated: ${updatedFields.join(", ")})`
            : "";
          finalizeNoteToolInvocation(invocation, "succeeded", {
            noteId: resolvedNoteId.value,
            updatedFields: updatedFields.join(","),
            contentLength:
              renderableContent && "htmlContent" in renderableContent
                ? renderableContent.htmlContent.length
                : undefined,
            ...(warning ? { warning } : {}),
          });
          const result = `Updated note ${noteId}${fieldsSummary}.`;
          return warning ? `${result}\n\n${warning}` : result;
        } catch (error) {
          finalizeNoteToolInvocation(invocation, "failed", {
            reason: error instanceof Error ? error.message : String(error),
            noteId,
          });
          logNoteToolError("note_update", context, error);
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_move: tool({
      description: "Move a note to a different folder.",
      inputSchema: moveNoteInput,
      execute: async ({ noteId, folderId }) => {
        const invocation = beginNoteToolInvocation("note_move", context, {
          noteIdLength: noteId.length,
          folderIdLength: folderId?.length,
        });
        try {
          const resolvedNoteId = resolveNoteId(conversationId, "note_move", noteId, { jobId });
          if (!resolvedNoteId.value) {
            const errorMessage = resolvedNoteId.error ?? "Invalid note ID.";
            finalizeNoteToolInvocation(invocation, "validation_failed", {
              reason: errorMessage,
            });
            return getServiceError(errorMessage);
          }

          const { value: resolvedFolderId, warning } = resolveNoteFolderId(
            conversationId,
            "note_move",
            folderId,
            { jobId },
          );
          const client = getConvexClient();
          await client.mutation(api.notes.moveToFolderForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            id: resolvedNoteId.value,
            folderId: resolvedFolderId,
          });
          finalizeNoteToolInvocation(invocation, "succeeded", {
            noteId: resolvedNoteId.value,
            folderId: resolvedFolderId,
            ...(warning ? { warning } : {}),
          });
          const result = `Moved note ${noteId}.`;
          return warning ? `${result}\n\n${warning}` : result;
        } catch (error) {
          finalizeNoteToolInvocation(invocation, "failed", {
            reason: error instanceof Error ? error.message : String(error),
            noteId,
          });
          logNoteToolError("note_move", context, error);
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_archive: tool({
      description: "Archive or unarchive a note.",
      inputSchema: archiveNoteInput,
      execute: async ({ noteId, isArchived }) => {
        const invocation = beginNoteToolInvocation("note_archive", context, {
          noteIdLength: noteId.length,
          isArchived,
        });
        try {
          const resolvedNoteId = resolveNoteId(conversationId, "note_archive", noteId, { jobId });
          if (!resolvedNoteId.value) {
            const errorMessage = resolvedNoteId.error ?? "Invalid note ID.";
            finalizeNoteToolInvocation(invocation, "validation_failed", {
              reason: errorMessage,
            });
            return getServiceError(errorMessage);
          }

          const client = getConvexClient();
          await client.mutation(api.notes.updateForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            id: resolvedNoteId.value,
            isArchived,
          });
          finalizeNoteToolInvocation(invocation, "succeeded", {
            noteId: resolvedNoteId.value,
            isArchived,
          });
          return isArchived ? `Archived note ${noteId}.` : `Restored note ${noteId}.`;
        } catch (error) {
          finalizeNoteToolInvocation(invocation, "failed", {
            reason: error instanceof Error ? error.message : String(error),
            noteId,
          });
          logNoteToolError("note_archive", context, error);
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_generate_from_conversation: tool({
      description: "Create a new note from current conversation history.",
      inputSchema: generateFromConversationInput,
      execute: async ({ title, folderId, source, messageLimit }) => {
        const invocation = beginNoteToolInvocation("note_generate_from_conversation", context, {
          titleLength: title.length,
          source,
          messageLimit,
        });
        try {
          const { value: resolvedFolderId, warning } = resolveNoteFolderId(
            conversationId,
            "note_generate_from_conversation",
            folderId,
            { jobId },
          );
          const normalizedTitle = sanitizeNoteToolOutput(title);
          const client = getConvexClient();
          const messages = await client.query(
            api.messages.listByConversationWindowForConversation,
            {
              serviceKey: env.AGENT_SECRET,
              conversationId,
              limit: messageLimit,
            },
          );

          const body = formatMessagesForNote(
            messages.map((message: { role: string; content: string }) => ({
              role: message.role,
              content: message.content,
            })),
            messageLimit,
          );

          const renderableContent = buildRenderableNoteContent(
            `## Source conversation\n${body || "(No messages)"}`,
            "note_generate_from_conversation",
            context,
            "Could not complete note action: generated note content is empty.",
          );
          if ("error" in renderableContent) {
            finalizeNoteToolInvocation(invocation, "validation_failed", {
              reason: renderableContent.error,
              messageCount: messages.length,
            });
            return renderableContent.error;
          }
          const id = await client.mutation(api.notes.createForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            title: normalizedTitle,
            content: renderableContent.htmlContent,
            folderId: resolvedFolderId,
            source: source ?? "chat-generated",
          });
          finalizeNoteToolInvocation(invocation, "succeeded", {
            noteId: id,
            contentLength: renderableContent.htmlContent.length,
            source: source ?? "chat-generated",
            messageCount: messages.length,
            ...(warning ? { warning } : {}),
          });
          const result = noteCreatedResult(id, normalizedTitle, source ?? "chat-generated");
          return warning ? `${result}\n\n${warning}` : result;
        } catch (error) {
          finalizeNoteToolInvocation(invocation, "failed", {
            reason: error instanceof Error ? error.message : String(error),
          });
          logNoteToolError("note_generate_from_conversation", context, error);
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_transform: tool({
      description:
        "Propose note content transformations for editor workflows (organize, rewrite, expand, summarize, extract, translate, clean-style).",
      inputSchema: noteTransformInput,
      execute: async ({ noteId, intent, tone, language }) => {
        const invocation = beginNoteToolInvocation("note_transform", context, {
          noteIdLength: noteId.length,
          intent,
          toneLength: tone?.length,
          language: language ?? "",
          languageLength: language?.length,
        });
        try {
          const resolvedNoteId = resolveNoteId(conversationId, "note_transform", noteId, { jobId });
          if (!resolvedNoteId.value) {
            const errorMessage = resolvedNoteId.error ?? "Invalid note ID.";
            finalizeNoteToolInvocation(invocation, "validation_failed", {
              reason: errorMessage,
            });
            return getServiceError(errorMessage);
          }

          const client = getConvexClient();
          const note = await client.query(api.notes.getForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            id: resolvedNoteId.value,
          });
          if (!note) {
            const reason = "Note not found.";
            finalizeNoteToolInvocation(invocation, "validation_failed", {
              noteId: resolvedNoteId.value,
              reason,
            });
            return reason;
          }

          if (!hasRenderableText(note.content)) {
            const reason = `Note "${note.title}" (${noteId}) is empty — there is no content to transform. Use note_update with a "content" field to add content directly.`;
            finalizeNoteToolInvocation(invocation, "validation_failed", {
              noteId: resolvedNoteId.value,
              reason,
            });
            return `Note "${note.title}" (${noteId}) is empty — there is no content to transform. Use note_update with a "content" field to add content directly.`;
          }

          const result = applyIntentTransform(note.content, intent, tone, language);
          const htmlResult = toHtmlFromPlainText(result.resultText);
          const output = JSON.stringify({
            noteId,
            title: note.title,
            intent,
            resultText: htmlResult,
            operations: result.operations,
          });
          finalizeNoteToolInvocation(invocation, "succeeded", {
            noteId: resolvedNoteId.value,
            intent,
            operations: result.operations,
            outputLength: output.length,
          });
          return output;
        } catch (error) {
          finalizeNoteToolInvocation(invocation, "failed", {
            reason: error instanceof Error ? error.message : String(error),
            noteId,
          });
          logNoteToolError("note_transform", context, error);
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_apply_transform: tool({
      description:
        "Apply a machine-generated note transform result to persist content changes (use after a transform proposal).",
      inputSchema: applyTransformInput,
      execute: async ({ noteId, resultText, operations }) => {
        const invocation = beginNoteToolInvocation("note_apply_transform", context, {
          noteIdLength: noteId.length,
          resultTextLength: resultText.length,
          operationsLength: operations?.length,
        });
        try {
          const resolvedNoteId = resolveNoteId(conversationId, "note_apply_transform", noteId, {
            jobId,
          });
          if (!resolvedNoteId.value) {
            const errorMessage = resolvedNoteId.error ?? "Invalid note ID.";
            finalizeNoteToolInvocation(invocation, "validation_failed", {
              reason: errorMessage,
            });
            return getServiceError(errorMessage);
          }

          const client = getConvexClient();
          const renderableContent = buildRenderableNoteContent(
            resultText,
            "note_apply_transform",
            context,
            "Could not complete note action: transform result is empty.",
          );
          if ("error" in renderableContent) {
            finalizeNoteToolInvocation(invocation, "validation_failed", {
              noteId: resolvedNoteId.value,
              reason: renderableContent.error,
            });
            return renderableContent.error;
          }
          await client.mutation(api.notes.applyAiPatchForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            id: resolvedNoteId.value,
            content: renderableContent.htmlContent,
            operations,
            model: "agent-notes-tools",
          });
          finalizeNoteToolInvocation(invocation, "succeeded", {
            noteId: resolvedNoteId.value,
            contentLength: renderableContent.htmlContent.length,
            operations: operations ?? "",
          });
          return `Applied transform for ${noteId}.`;
        } catch (error) {
          finalizeNoteToolInvocation(invocation, "failed", {
            reason: error instanceof Error ? error.message : String(error),
            noteId,
          });
          logNoteToolError("note_apply_transform", context, error);
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_update_from_ai: tool({
      description:
        "Apply an AI-generated note update payload, intended for explicit AI confirmation flows.",
      inputSchema: applyTransformInput,
      execute: async ({ noteId, resultText, operations }) => {
        const invocation = beginNoteToolInvocation("note_update_from_ai", context, {
          noteIdLength: noteId.length,
          resultTextLength: resultText.length,
          operationsLength: operations?.length,
        });
        try {
          const resolvedNoteId = resolveNoteId(conversationId, "note_update_from_ai", noteId, {
            jobId,
          });
          if (!resolvedNoteId.value) {
            const errorMessage = resolvedNoteId.error ?? "Invalid note ID.";
            finalizeNoteToolInvocation(invocation, "validation_failed", {
              reason: errorMessage,
            });
            return getServiceError(errorMessage);
          }

          const client = getConvexClient();
          const renderableContent = buildRenderableNoteContent(
            resultText,
            "note_update_from_ai",
            context,
            "Could not complete note action: AI update content is empty.",
          );
          if ("error" in renderableContent) {
            finalizeNoteToolInvocation(invocation, "validation_failed", {
              noteId: resolvedNoteId.value,
              reason: renderableContent.error,
            });
            return renderableContent.error;
          }
          await client.mutation(api.notes.applyAiPatchForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            id: resolvedNoteId.value,
            content: renderableContent.htmlContent,
            operations,
            model: "agent-notes-tools",
          });
          finalizeNoteToolInvocation(invocation, "succeeded", {
            noteId: resolvedNoteId.value,
            contentLength: renderableContent.htmlContent.length,
            operations: operations ?? "",
          });
          return `Applied AI update for ${noteId}.`;
        } catch (error) {
          finalizeNoteToolInvocation(invocation, "failed", {
            reason: error instanceof Error ? error.message : String(error),
            noteId,
          });
          logNoteToolError("note_update_from_ai", context, error);
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
  };
}
