import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { serviceQuery } from "./auth";

const memoryDoc = v.object({
  _id: v.id("memories"),
  _creationTime: v.number(),
  conversationId: v.optional(v.id("conversations")),
  content: v.string(),
  embedding: v.array(v.float64()),
  source: v.union(v.literal("conversation"), v.literal("manual")),
  createdAt: v.number(),
});

export const listByConversation = serviceQuery({
  args: { conversationId: v.id("conversations") },
  returns: v.array(memoryDoc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("memories")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
      .collect();
  },
});

export const insertMemory = internalMutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    content: v.string(),
    embedding: v.array(v.float64()),
    source: v.union(v.literal("conversation"), v.literal("manual")),
  },
  returns: v.id("memories"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("memories", {
      conversationId: args.conversationId,
      content: args.content,
      embedding: args.embedding,
      source: args.source,
      createdAt: Date.now(),
    });
  },
});

export const removeMemory = internalMutation({
  args: { memoryId: v.id("memories") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.memoryId);
    return null;
  },
});

export const store = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    content: v.string(),
    embedding: v.array(v.float64()),
    source: v.union(v.literal("conversation"), v.literal("manual")),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runMutation(internal.memories.insertMemory, {
      conversationId: args.conversationId,
      content: args.content,
      embedding: args.embedding,
      source: args.source,
    });
  },
});

export const search = action({
  args: {
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ id: string; content: string; source: string; score: number }>> => {
    const results = await ctx.vectorSearch("memories", "by_embedding", {
      vector: args.embedding,
      limit: args.limit ?? 5,
      ...(args.conversationId !== undefined && {
        filter: (q) => q.eq("conversationId", args.conversationId),
      }),
    });

    const docs = await ctx.runQuery(internal.memories.fetchResults, {
      ids: results.map((r) => r._id),
    });

    return docs.map(
      (doc: { _id: string; content: string; source: "conversation" | "manual" }, i) => ({
        id: doc._id,
        content: doc.content,
        source: doc.source,
        score: results[i]?._score ?? 0,
      }),
    );
  },
});

export const fetchResults = internalQuery({
  args: { ids: v.array(v.id("memories")) },
  returns: v.array(memoryDoc),
  handler: async (ctx, args) => {
    const results = [];
    for (const id of args.ids) {
      const doc = await ctx.db.get(id);
      if (doc !== null) {
        results.push(doc);
      }
    }
    return results;
  },
});
