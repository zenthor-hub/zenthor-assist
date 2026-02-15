import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { env } from "@zenthor-assist/env/agent";
import { tool } from "ai";
import { z } from "zod";

import { getConvexClient } from "../../convex/client";

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

const noteFolderIdPattern = /^[a-z0-9]{32}$/i;

function normalizeNoteFolderId(folderId?: string): Id<"noteFolders"> | undefined {
  const normalized = cleanText(folderId);
  if (!normalized) return undefined;
  if (!noteFolderIdPattern.test(normalized)) return undefined;
  return normalized as Id<"noteFolders">;
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
  return `${note.title} (${note._id}) — archived: ${note.isArchived ? "yes" : "no"}${note.folderId ? ` · folder: ${note.folderId}` : ""}\n${summarizeText(note.content, 240)}`;
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
  const normalized = cleanText(content);
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

function getServiceError(message: string): string {
  return `Could not complete note action: ${message}`;
}

export function createNoteTools(conversationId: Id<"conversations">) {
  return {
    note_list: tool({
      description: "List notes visible in this conversation's workspace.",
      inputSchema: listNotesInput,
      execute: async ({ folderId, isArchived, limit }) => {
        try {
          const client = getConvexClient();
          const notes = await client.query(api.notes.listForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            folderId: normalizeNoteFolderId(folderId),
            isArchived,
            limit,
          });
          if (!notes.length) return "No notes found.";
          return notes.map(toNoteResult).join("\n\n");
        } catch (error) {
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_get: tool({
      description: "Get a note by ID from this user's workspace.",
      inputSchema: getNoteInput,
      execute: async ({ noteId }) => {
        try {
          const client = getConvexClient();
          const note = await client.query(api.notes.getForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            id: noteId as Id<"notes">,
          });

          if (!note) return "Note not found.";
          return `Title: ${note.title}\nID: ${note._id}\nArchived: ${note.isArchived}\n${note.content}`;
        } catch (error) {
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_create: tool({
      description: "Create a new note in the user's workspace.",
      inputSchema: createNoteInput,
      execute: async ({ title, content, folderId, source }) => {
        try {
          const normalizedTitle = sanitizeNoteToolOutput(title);
          const client = getConvexClient();
          const id = await client.mutation(api.notes.createForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            title: normalizedTitle,
            content,
            folderId: normalizeNoteFolderId(folderId),
            source: source ?? "chat-generated",
          });
          return noteCreatedResult(id, normalizedTitle, source ?? "chat-generated");
        } catch (error) {
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_update: tool({
      description: "Update an existing note's title, content, folder, or archive status.",
      inputSchema: updateNoteInput,
      execute: async ({ noteId, title, content, folderId, isArchived, metadata }) => {
        try {
          const client = getConvexClient();
          await client.mutation(api.notes.updateForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            id: noteId as Id<"notes">,
            title,
            content,
            folderId: normalizeNoteFolderId(folderId),
            isArchived,
            metadata,
          });
          return `Updated note ${noteId}.`;
        } catch (error) {
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_move: tool({
      description: "Move a note to a different folder.",
      inputSchema: moveNoteInput,
      execute: async ({ noteId, folderId }) => {
        try {
          const client = getConvexClient();
          await client.mutation(api.notes.moveToFolderForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            id: noteId as Id<"notes">,
            folderId: normalizeNoteFolderId(folderId),
          });
          return `Moved note ${noteId}.`;
        } catch (error) {
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_archive: tool({
      description: "Archive or unarchive a note.",
      inputSchema: archiveNoteInput,
      execute: async ({ noteId, isArchived }) => {
        try {
          const client = getConvexClient();
          await client.mutation(api.notes.updateForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            id: noteId as Id<"notes">,
            isArchived,
          });
          return isArchived ? `Archived note ${noteId}.` : `Restored note ${noteId}.`;
        } catch (error) {
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_generate_from_conversation: tool({
      description: "Create a new note from current conversation history.",
      inputSchema: generateFromConversationInput,
      execute: async ({ title, folderId, source, messageLimit }) => {
        try {
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

          const id = await client.mutation(api.notes.createForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            title: normalizedTitle,
            content: `## Source conversation\n${body || "(No messages)"}`,
            folderId: normalizeNoteFolderId(folderId),
            source: source ?? "chat-generated",
          });
          return noteCreatedResult(id, normalizedTitle, source ?? "chat-generated");
        } catch (error) {
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_transform: tool({
      description:
        "Propose note content transformations for editor workflows (organize, rewrite, expand, summarize, extract, translate, clean-style).",
      inputSchema: noteTransformInput,
      execute: async ({ noteId, intent, tone, language }) => {
        try {
          const client = getConvexClient();
          const note = await client.query(api.notes.getForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            id: noteId as Id<"notes">,
          });
          if (!note) return "Note not found.";

          const result = applyIntentTransform(note.content, intent, tone, language);
          return JSON.stringify({
            noteId,
            intent,
            resultText: result.resultText,
            operations: result.operations,
          });
        } catch (error) {
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_apply_transform: tool({
      description:
        "Apply a machine-generated note transform result to persist content changes (use after a transform proposal).",
      inputSchema: applyTransformInput,
      execute: async ({ noteId, resultText, operations }) => {
        try {
          const client = getConvexClient();
          await client.mutation(api.notes.applyAiPatchForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            id: noteId as Id<"notes">,
            content: resultText,
            operations,
            model: "agent-notes-tools",
          });
          return `Applied transform for ${noteId}.`;
        } catch (error) {
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    note_update_from_ai: tool({
      description:
        "Apply an AI-generated note update payload, intended for explicit AI confirmation flows.",
      inputSchema: applyTransformInput,
      execute: async ({ noteId, resultText, operations }) => {
        try {
          const client = getConvexClient();
          await client.mutation(api.notes.applyAiPatchForConversation, {
            serviceKey: env.AGENT_SECRET,
            conversationId,
            id: noteId as Id<"notes">,
            content: resultText,
            operations,
            model: "agent-notes-tools",
          });
          return `Applied AI update for ${noteId}.`;
        } catch (error) {
          return getServiceError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
  };
}
