import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    channel: v.union(v.literal("whatsapp"), v.literal("web")),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "user",
      content: args.content,
      channel: args.channel,
      status: "sent",
    });

    await ctx.db.insert("agentQueue", {
      messageId,
      conversationId: args.conversationId,
      status: "pending",
    });

    return messageId;
  },
});

export const addAssistantMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    channel: v.union(v.literal("whatsapp"), v.literal("web")),
    toolCalls: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "assistant",
      content: args.content,
      channel: args.channel,
      toolCalls: args.toolCalls,
      status: "sent",
    });
  },
});

export const listByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
