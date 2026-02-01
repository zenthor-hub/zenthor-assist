import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

export const getOrCreate = mutation({
  args: {
    userId: v.optional(v.id("users")),
    contactId: v.optional(v.id("contacts")),
    channel: v.union(v.literal("whatsapp"), v.literal("web")),
  },
  handler: async (ctx, args) => {
    if (args.channel === "web" && args.userId) {
      const existing = await ctx.db
        .query("conversations")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .filter((q) => q.eq(q.field("channel"), "web"))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();

      if (existing) return existing._id;

      return await ctx.db.insert("conversations", {
        userId: args.userId,
        channel: "web",
        status: "active",
      });
    }

    if (args.channel === "whatsapp" && args.contactId) {
      const existing = await ctx.db
        .query("conversations")
        .withIndex("by_contactId", (q) => q.eq("contactId", args.contactId))
        .filter((q) => q.eq(q.field("channel"), "whatsapp"))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();

      if (existing) return existing._id;

      return await ctx.db.insert("conversations", {
        contactId: args.contactId,
        channel: "whatsapp",
        status: "active",
      });
    }

    throw new Error("Must provide userId for web or contactId for whatsapp");
  },
});

export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_contactId", (q) => q.eq("contactId", args.contactId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    userId: v.id("users"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("conversations", {
      userId: args.userId,
      channel: "web",
      status: "active",
      title: args.title ?? "New chat",
    });
  },
});

export const archive = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.id);
    if (!conv) throw new Error("Conversation not found");
    if (conv.channel === "whatsapp") throw new Error("Cannot archive WhatsApp conversations");
    await ctx.db.patch(args.id, { status: "archived" });
  },
});

export const updateTitle = mutation({
  args: {
    id: v.id("conversations"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { title: args.title });
  },
});

export const listRecentWithLastMessage = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const results = await Promise.all(
      conversations.map(async (conv) => {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_conversationId", (q) => q.eq("conversationId", conv._id))
          .order("desc")
          .first();

        return {
          ...conv,
          lastMessage: messages
            ? { content: messages.content, role: messages.role, createdAt: messages._creationTime }
            : null,
        };
      }),
    );

    return results.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ?? a._creationTime;
      const bTime = b.lastMessage?.createdAt ?? b._creationTime;
      return bTime - aTime;
    });
  },
});
