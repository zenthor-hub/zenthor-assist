import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authMutation, authQuery, serviceMutation, serviceQuery } from "./auth";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;
type NoteCtx = Pick<QueryCtx | MutationCtx, "db">;

async function getConversationOwnerUserId(ctx: DbCtx, conversationId: Id<"conversations">) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) return null;

  if (conversation.userId) return conversation.userId;
  if (!conversation.contactId) return null;

  const contact = await ctx.db.get(conversation.contactId);
  return contact?.userId ?? null;
}

async function getFolderOwnerId(ctx: DbCtx, folderId?: Id<"noteFolders">) {
  if (!folderId) return null;
  const folder = await ctx.db.get(folderId);
  return folder?.userId ?? null;
}

const sourceValidator = v.union(
  v.literal("manual"),
  v.literal("chat-generated"),
  v.literal("imported"),
);

async function getNoteOwner(ctx: NoteCtx, noteId: Id<"notes">, userId: Id<"users">) {
  const note = await ctx.db.get(noteId);
  if (!note || note.userId !== userId) return null;
  return note;
}

async function getConversationBoundNote(
  ctx: NoteCtx,
  noteId: Id<"notes">,
  conversationId: Id<"conversations">,
) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || !conversation.userId) return null;

  const note = await getNoteOwner(ctx, noteId, conversation.userId);
  if (!note) return null;

  if (note.conversationId && note.conversationId !== conversationId) {
    throw new ConvexError("Conversation does not match note");
  }

  if (!note.conversationId) {
    throw new ConvexError("Note is not linked to this conversation");
  }

  return note;
}

const noteDoc = v.object({
  _id: v.id("notes"),
  _creationTime: v.number(),
  userId: v.id("users"),
  folderId: v.optional(v.id("noteFolders")),
  title: v.string(),
  content: v.string(),
  isArchived: v.boolean(),
  isPinned: v.optional(v.boolean()),
  source: sourceValidator,
  conversationId: v.optional(v.id("conversations")),
  lastAiActionAt: v.optional(v.number()),
  lastAiModel: v.optional(v.string()),
  metadata: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const list = authQuery({
  args: {
    folderId: v.optional(v.id("noteFolders")),
    isArchived: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.array(noteDoc),
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 80, 200);
    const baseQuery = args.folderId
      ? ctx.db.query("notes").withIndex("by_folderId", (q) => q.eq("folderId", args.folderId!))
      : ctx.db.query("notes").withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id));

    const notes = await baseQuery
      .filter((q) =>
        q.eq(q.field("isArchived"), args.isArchived === undefined ? false : args.isArchived),
      )
      .order("desc")
      .take(limit);

    return notes.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const listForConversation = serviceQuery({
  args: {
    conversationId: v.id("conversations"),
    folderId: v.optional(v.id("noteFolders")),
    isArchived: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.array(noteDoc),
  handler: async (ctx, args) => {
    const userId = await getConversationOwnerUserId(ctx, args.conversationId);
    if (!userId) return [];

    const limit = Math.min(args.limit ?? 80, 200);
    let query = ctx.db
      .query("notes")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
      .filter((q) => q.eq(q.field("isArchived"), args.isArchived ?? false));

    if (args.folderId) {
      query = query.filter((q) => q.eq(q.field("folderId"), args.folderId));
    }

    const notes = await query.order("desc").take(limit);
    return notes.filter((note) => note.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const get = authQuery({
  args: { id: v.id("notes") },
  returns: v.union(noteDoc, v.null()),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id);
    if (!note || note.userId !== ctx.auth.user._id) return null;
    return note;
  },
});

export const getForConversation = serviceQuery({
  args: {
    conversationId: v.id("conversations"),
    id: v.id("notes"),
  },
  returns: v.union(noteDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await getConversationOwnerUserId(ctx, args.conversationId);
    if (!userId) return null;

    const note = await getNoteOwner(ctx, args.id, userId);
    if (!note) return null;

    if (note.conversationId && note.conversationId !== args.conversationId) return null;
    return note;
  },
});

export const create = authMutation({
  args: {
    title: v.string(),
    content: v.string(),
    folderId: v.optional(v.id("noteFolders")),
    source: v.optional(sourceValidator),
    isPinned: v.optional(v.boolean()),
    metadata: v.optional(v.any()),
  },
  returns: v.id("notes"),
  handler: async (ctx, args) => {
    if (args.folderId) {
      const folderOwnerId = await getFolderOwnerId(ctx, args.folderId);
      if (folderOwnerId !== ctx.auth.user._id) {
        throw new ConvexError("Folder not found");
      }
    }

    const now = Date.now();
    return await ctx.db.insert("notes", {
      userId: ctx.auth.user._id,
      folderId: args.folderId,
      title: args.title,
      content: args.content,
      isArchived: false,
      isPinned: args.isPinned,
      source: args.source ?? "manual",
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = authMutation({
  args: {
    id: v.id("notes"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    folderId: v.optional(v.id("noteFolders")),
    isArchived: v.optional(v.boolean()),
    isPinned: v.optional(v.boolean()),
    source: v.optional(sourceValidator),
    metadata: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id);
    if (!note || note.userId !== ctx.auth.user._id) return null;

    if (args.folderId) {
      const folderOwnerId = await getFolderOwnerId(ctx, args.folderId);
      if (folderOwnerId !== ctx.auth.user._id) {
        throw new ConvexError("Folder not found");
      }
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.content !== undefined) patch.content = args.content;
    if (args.folderId !== undefined) patch.folderId = args.folderId;
    if (args.isArchived !== undefined) patch.isArchived = args.isArchived;
    if (args.isPinned !== undefined) patch.isPinned = args.isPinned;
    if (args.source !== undefined) patch.source = args.source;
    if (args.metadata !== undefined) patch.metadata = args.metadata;
    await ctx.db.patch(note._id, patch);
    return null;
  },
});

export const deleteNote = authMutation({
  args: { id: v.id("notes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id);
    if (!note || note.userId !== ctx.auth.user._id) return null;
    await ctx.db.delete(args.id);
    return null;
  },
});

export const archive = authMutation({
  args: {
    id: v.id("notes"),
    isArchived: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id);
    if (!note || note.userId !== ctx.auth.user._id) return null;

    await ctx.db.patch(note._id, {
      isArchived: args.isArchived ?? true,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const moveToFolder = authMutation({
  args: {
    id: v.id("notes"),
    folderId: v.optional(v.id("noteFolders")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id);
    if (!note || note.userId !== ctx.auth.user._id) return null;

    if (args.folderId) {
      const folderOwnerId = await getFolderOwnerId(ctx, args.folderId);
      if (folderOwnerId !== ctx.auth.user._id) {
        throw new ConvexError("Folder not found");
      }
    }

    await ctx.db.patch(note._id, {
      folderId: args.folderId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const attachConversation = authMutation({
  args: {
    id: v.id("notes"),
    conversationId: v.id("conversations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id);
    if (!note || note.userId !== ctx.auth.user._id) return null;

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== ctx.auth.user._id) {
      throw new ConvexError("Conversation not found");
    }

    await ctx.db.patch(note._id, {
      conversationId: args.conversationId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const ensureThread = authMutation({
  args: { id: v.id("notes") },
  returns: v.id("conversations"),
  handler: async (ctx, args): Promise<Id<"conversations">> => {
    const note = await ctx.db.get(args.id);
    if (!note || note.userId !== ctx.auth.user._id) {
      throw new ConvexError("Note not found");
    }

    if (note.conversationId) {
      const conversation = await ctx.db.get(note.conversationId);
      if (
        conversation &&
        conversation.channel === "web" &&
        conversation.userId === ctx.auth.user._id
      ) {
        return conversation._id;
      }
    }

    const conversationId = await (async (): Promise<Id<"conversations">> => {
      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
        .filter((q) => q.eq(q.field("channel"), "web"))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();

      if (conversation) return conversation._id;

      return ctx.db.insert("conversations", {
        userId: ctx.auth.user._id,
        channel: "web",
        status: "active",
      });
    })();
    await ctx.db.patch(note._id, { conversationId });
    return conversationId;
  },
});

export const applyAiPatch = authMutation({
  args: {
    id: v.id("notes"),
    content: v.string(),
    operations: v.optional(v.string()),
    model: v.optional(v.string()),
    source: v.optional(sourceValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id);
    if (!note || note.userId !== ctx.auth.user._id) return null;

    const now = Date.now();
    const nextMetadata = note.metadata
      ? {
          ...note.metadata,
          lastAiActionAt: now,
          lastAiModel: args.model,
          lastAiTransform: args.operations,
        }
      : {
          lastAiActionAt: now,
          lastAiModel: args.model,
          lastAiTransform: args.operations,
        };

    await ctx.db.patch(note._id, {
      content: args.content,
      metadata: nextMetadata,
      lastAiActionAt: now,
      lastAiModel: args.model,
      source: args.source ?? note.source,
      updatedAt: now,
    });
    return null;
  },
});

export const createForConversation = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
    content: v.string(),
    folderId: v.optional(v.id("noteFolders")),
    source: v.optional(sourceValidator),
  },
  returns: v.id("notes"),
  handler: async (ctx, args) => {
    const userId = await getConversationOwnerUserId(ctx, args.conversationId);
    if (!userId) throw new ConvexError("Could not resolve user for conversation");

    if (args.folderId) {
      const folderOwnerId = await getFolderOwnerId(ctx, args.folderId);
      if (folderOwnerId !== userId) {
        throw new ConvexError("Folder not found");
      }
    }

    const now = Date.now();
    return await ctx.db.insert("notes", {
      userId,
      folderId: args.folderId,
      title: args.title,
      content: args.content,
      isArchived: false,
      source: args.source ?? "chat-generated",
      conversationId: args.conversationId,
      createdAt: now,
      updatedAt: now,
      metadata: {
        createdFrom: "conversation",
      },
    });
  },
});

export const moveToFolderForConversation = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    id: v.id("notes"),
    folderId: v.optional(v.id("noteFolders")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await getConversationBoundNote(ctx, args.id, args.conversationId);
    if (!note) return null;

    if (args.folderId) {
      const folderOwnerId = await getFolderOwnerId(ctx, args.folderId);
      if (folderOwnerId !== note.userId) {
        throw new ConvexError("Folder not found");
      }
    }

    await ctx.db.patch(note._id, {
      folderId: args.folderId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const updateForConversation = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    id: v.id("notes"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    folderId: v.optional(v.id("noteFolders")),
    isArchived: v.optional(v.boolean()),
    isPinned: v.optional(v.boolean()),
    source: v.optional(sourceValidator),
    metadata: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await getConversationBoundNote(ctx, args.id, args.conversationId);
    if (!note) return null;

    if (args.folderId) {
      const folderOwnerId = await getFolderOwnerId(ctx, args.folderId);
      if (folderOwnerId !== note.userId) {
        throw new ConvexError("Folder not found");
      }
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.content !== undefined) patch.content = args.content;
    if (args.folderId !== undefined) patch.folderId = args.folderId;
    if (args.isArchived !== undefined) patch.isArchived = args.isArchived;
    if (args.isPinned !== undefined) patch.isPinned = args.isPinned;
    if (args.source !== undefined) patch.source = args.source;
    if (args.metadata !== undefined) patch.metadata = args.metadata;
    await ctx.db.patch(note._id, patch);
    return null;
  },
});

export const deleteForConversation = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    id: v.id("notes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await getConversationBoundNote(ctx, args.id, args.conversationId);
    if (!note) return null;

    await ctx.db.delete(note._id);
    return null;
  },
});

export const applyAiPatchForConversation = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    id: v.id("notes"),
    content: v.string(),
    operations: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await getConversationBoundNote(ctx, args.id, args.conversationId);
    if (!note) return null;

    const now = Date.now();
    const nextMetadata = note.metadata
      ? {
          ...note.metadata,
          lastAiPatchAppliedAt: now,
          lastAiPatchModel: args.model,
          lastAiPatchOperations: args.operations,
        }
      : {
          lastAiPatchAppliedAt: now,
          lastAiPatchModel: args.model,
          lastAiPatchOperations: args.operations,
        };

    await ctx.db.patch(note._id, {
      content: args.content,
      metadata: nextMetadata,
      lastAiActionAt: now,
      lastAiModel: args.model,
      updatedAt: now,
    });
    return null;
  },
});
