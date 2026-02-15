import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authMutation, authQuery, serviceMutation, serviceQuery } from "./auth";
import { getConversationIfOwnedByUser } from "./lib/auth";

const toolCallValidator = v.optional(
  v.array(
    v.object({
      name: v.string(),
      input: v.any(),
      output: v.optional(v.any()),
    }),
  ),
);

const mediaTypeValidator = v.union(
  v.literal("audio"),
  v.literal("image"),
  v.literal("video"),
  v.literal("document"),
);

const mediaValidator = v.optional(
  v.object({
    type: mediaTypeValidator,
    sourceId: v.string(),
    mimetype: v.string(),
    url: v.optional(v.string()),
    transcript: v.optional(v.string()),
  }),
);

const messageDoc = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  conversationId: v.id("conversations"),
  noteId: v.optional(v.id("notes")),
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
  content: v.string(),
  channel: v.union(v.literal("whatsapp"), v.literal("web"), v.literal("telegram")),
  toolCalls: toolCallValidator,
  media: mediaValidator,
  modelUsed: v.optional(v.string()),
  streaming: v.optional(v.boolean()),
  status: v.union(
    v.literal("pending"),
    v.literal("sent"),
    v.literal("delivered"),
    v.literal("failed"),
  ),
});

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;
type MessageNoteContext = Pick<QueryCtx | MutationCtx, "db">;

async function getConversationOwnerUserId(ctx: DbCtx, conversationId: Id<"conversations">) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) return null;
  return conversation.userId ?? null;
}

async function getOwnedNote(ctx: MessageNoteContext, noteId: Id<"notes">, userId: Id<"users">) {
  const note = await ctx.db.get(noteId);
  if (!note || note.userId !== userId || note.isArchived) return null;
  return note;
}

async function ensureNoteConversationMatch(
  ctx: MessageNoteContext,
  noteId: Id<"notes">,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
) {
  const note = await getOwnedNote(ctx, noteId, userId);
  if (!note) {
    throw new ConvexError("Note not found");
  }

  if (note.conversationId && note.conversationId !== conversationId) {
    throw new ConvexError("Conversation does not match note");
  }
}

export const send = authMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    media: mediaValidator,
    noteId: v.optional(v.id("notes")),
    channel: v.optional(v.union(v.literal("whatsapp"), v.literal("web"), v.literal("telegram"))),
  },
  returns: v.union(v.id("messages"), v.null()),
  handler: async (ctx, args) => {
    const conv = await getConversationIfOwnedByUser(ctx, ctx.auth.user._id, args.conversationId);
    if (!conv) return null;

    const trimmedContent = args.content.trim();
    const content =
      trimmedContent.length === 0 && args.media
        ? args.media.type === "audio"
          ? "[Audio message]"
          : args.media.type === "image"
            ? "[Image message]"
            : "[Media message]"
        : args.content;

    if (args.noteId) {
      await ensureNoteConversationMatch(ctx, args.noteId, args.conversationId, ctx.auth.user._id);
    }

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      noteId: args.noteId,
      role: "user",
      content,
      media: args.media,
      channel: conv.channel,
      status: "sent",
    });

    if (!conv.title || conv.title === "New chat") {
      const titleSource = content.length > 0 ? content : "Image message";
      const title = titleSource.length > 50 ? `${titleSource.slice(0, 50)}…` : titleSource;
      await ctx.db.patch(args.conversationId, { title });
    }

    await ctx.db.insert("agentQueue", {
      messageId,
      conversationId: args.conversationId,
      status: "pending",
    });

    return messageId;
  },
});

export const sendService = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    media: mediaValidator,
    noteId: v.optional(v.id("notes")),
    channel: v.optional(v.union(v.literal("whatsapp"), v.literal("web"), v.literal("telegram"))),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new ConvexError("Conversation not found");
    }

    if (args.noteId) {
      const userId = conversation.userId;
      if (!userId) throw new ConvexError("Conversation is not user-owned");
      await ensureNoteConversationMatch(ctx, args.noteId, args.conversationId, userId);
    }

    const trimmedContent = args.content.trim();
    const content =
      trimmedContent.length === 0 && args.media
        ? args.media.type === "audio"
          ? "[Audio message]"
          : args.media.type === "image"
            ? "[Image message]"
            : "[Media message]"
        : args.content;

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      noteId: args.noteId,
      role: "user",
      content,
      media: args.media,
      channel: conversation.channel,
      status: "sent",
    });

    if (!conversation.title || conversation.title === "New chat") {
      const titleSource = content.length > 0 ? content : "Media message";
      const title = titleSource.length > 50 ? `${titleSource.slice(0, 50)}…` : titleSource;
      await ctx.db.patch(args.conversationId, { title });
    }

    await ctx.db.insert("agentQueue", {
      messageId,
      conversationId: args.conversationId,
      status: "pending",
    });

    return messageId;
  },
});

export const addAssistantMessage = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    noteId: v.optional(v.id("notes")),
    channel: v.optional(v.union(v.literal("whatsapp"), v.literal("web"), v.literal("telegram"))),
    toolCalls: toolCallValidator,
    modelUsed: v.optional(v.string()),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new ConvexError("Conversation not found");
    }

    return await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      noteId: args.noteId,
      role: "assistant",
      content: args.content,
      channel: conversation.channel,
      toolCalls: args.toolCalls,
      modelUsed: args.modelUsed,
      status: "sent",
    });
  },
});

export const addSummaryMessage = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    noteId: v.optional(v.id("notes")),
    channel: v.optional(v.union(v.literal("whatsapp"), v.literal("web"), v.literal("telegram"))),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new ConvexError("Conversation not found");
    }

    return await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      noteId: args.noteId,
      role: "system",
      content: args.content,
      channel: conversation.channel,
      status: "sent",
    });
  },
});

export const createPlaceholder = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    noteId: v.optional(v.id("notes")),
    channel: v.optional(v.union(v.literal("whatsapp"), v.literal("web"))),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new ConvexError("Conversation not found");
    }

    return await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      noteId: args.noteId,
      role: "assistant",
      content: "",
      channel: conversation.channel,
      streaming: true,
      status: "pending",
    });
  },
});

export const updateStreamingContent = serviceMutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { content: args.content });
    return null;
  },
});

export const finalizeMessage = serviceMutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    toolCalls: toolCallValidator,
    modelUsed: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      content: args.content,
      toolCalls: args.toolCalls,
      modelUsed: args.modelUsed,
      streaming: false,
      status: "sent",
    });
    return null;
  },
});

/**
 * Mark a placeholder message as failed. Called when job generation
 * fails so the UI stops showing infinite loading dots.
 */
export const failPlaceholder = serviceMutation({
  args: {
    messageId: v.id("messages"),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) return null;

    await ctx.db.patch(args.messageId, {
      content: args.errorMessage ?? "Sorry, something went wrong. Please try again.",
      streaming: false,
      status: "failed",
    });
    return null;
  },
});

export const updateMediaTranscript = serviceMutation({
  args: {
    messageId: v.id("messages"),
    transcript: v.string(),
    mediaUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg?.media) return null;

    await ctx.db.patch(args.messageId, {
      content: args.transcript,
      media: {
        ...msg.media,
        transcript: args.transcript,
        ...(args.mediaUrl ? { url: args.mediaUrl } : {}),
      },
    });

    // Update conversation title with first ~50 chars of transcript
    const conversation = await ctx.db.get(msg.conversationId);
    if (conversation && (conversation.title === "Voice message" || !conversation.title)) {
      const title =
        args.transcript.length > 50 ? `${args.transcript.slice(0, 50)}…` : args.transcript;
      await ctx.db.patch(msg.conversationId, { title });
    }

    return null;
  },
});

export const listByConversation = authQuery({
  args: { conversationId: v.id("conversations") },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const conv = await getConversationIfOwnedByUser(ctx, ctx.auth.user._id, args.conversationId);
    if (!conv) return [];
    return await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
      .collect();
  },
});

export const listByConversationWindow = authQuery({
  args: {
    conversationId: v.id("conversations"),
    noteId: v.optional(v.id("notes")),
    beforeMessageId: v.optional(v.id("messages")),
    limit: v.optional(v.number()),
  },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const conv = await getConversationIfOwnedByUser(ctx, ctx.auth.user._id, args.conversationId);
    if (!conv) return [];

    const limit = Math.min(args.limit ?? 180, 320);

    let query = args.noteId
      ? ctx.db
          .query("messages")
          .withIndex("by_noteId", (q) => q.eq("noteId", args.noteId))
          .filter((q) => q.eq(q.field("conversationId"), args.conversationId))
      : ctx.db
          .query("messages")
          .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId));

    if (args.beforeMessageId) {
      const beforeMessage = await ctx.db.get(args.beforeMessageId);
      if (beforeMessage) {
        query = query.filter((q) => q.lt(q.field("_creationTime"), beforeMessage._creationTime));
      }
    }

    const messages = await query.order("desc").take(limit);
    return messages.reverse();
  },
});

export const listByConversationWindowForConversation = serviceQuery({
  args: {
    conversationId: v.id("conversations"),
    noteId: v.optional(v.id("notes")),
    beforeMessageId: v.optional(v.id("messages")),
    limit: v.optional(v.number()),
  },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const ownerId = await getConversationOwnerUserId(ctx, args.conversationId);
    if (!ownerId) return [];

    const limit = Math.min(args.limit ?? 180, 320);

    let query = args.noteId
      ? ctx.db
          .query("messages")
          .withIndex("by_noteId", (q) => q.eq("noteId", args.noteId))
          .filter((q) => q.eq(q.field("conversationId"), args.conversationId))
      : ctx.db
          .query("messages")
          .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId));

    if (args.beforeMessageId) {
      const beforeMessage = await ctx.db.get(args.beforeMessageId);
      if (beforeMessage) {
        query = query.filter((q) => q.lt(q.field("_creationTime"), beforeMessage._creationTime));
      }
    }

    const messages = await query.order("desc").take(limit);
    return messages.reverse();
  },
});

export const listForNote = authQuery({
  args: { noteId: v.id("notes"), limit: v.optional(v.number()) },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note || note.userId !== ctx.auth.user._id || !note.conversationId) return [];

    const conv = await getConversationIfOwnedByUser(ctx, ctx.auth.user._id, note.conversationId);
    if (!conv) return [];

    const limit = Math.min(args.limit ?? 180, 320);
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_noteId", (q) => q.eq("noteId", args.noteId))
      .filter((q) => q.eq(q.field("conversationId"), note.conversationId))
      .order("desc")
      .take(limit);

    return messages.reverse();
  },
});

export const get = authQuery({
  args: { id: v.id("messages") },
  returns: v.union(messageDoc, v.null()),
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.id);
    if (!msg) return null;
    const conv = await getConversationIfOwnedByUser(ctx, ctx.auth.user._id, msg.conversationId);
    if (!conv) return null;
    return msg;
  },
});
