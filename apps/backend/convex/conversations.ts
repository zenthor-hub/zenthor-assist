import { ConvexError, v } from "convex/values";

import { authMutation, authQuery, serviceMutation } from "./auth";
import { getConversationIfOwnedByUser } from "./lib/auth";

const conversationDoc = v.object({
  _id: v.id("conversations"),
  _creationTime: v.number(),
  channel: v.union(v.literal("whatsapp"), v.literal("web")),
  userId: v.optional(v.id("users")),
  contactId: v.optional(v.id("contacts")),
  agentId: v.optional(v.id("agents")),
  accountId: v.optional(v.string()),
  title: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("archived")),
});

export const getOrCreate = serviceMutation({
  args: {
    userId: v.optional(v.id("users")),
    contactId: v.optional(v.id("contacts")),
    channel: v.union(v.literal("whatsapp"), v.literal("web")),
    agentId: v.optional(v.id("agents")),
    accountId: v.optional(v.string()),
  },
  returns: v.id("conversations"),
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
        ...(args.agentId && { agentId: args.agentId }),
      });
    }

    if (args.channel === "whatsapp" && args.contactId) {
      const accountId = args.accountId ?? "default";

      const existing = await ctx.db
        .query("conversations")
        .withIndex("by_contactId", (q) => q.eq("contactId", args.contactId))
        .filter((q) => q.eq(q.field("channel"), "whatsapp"))
        .filter((q) => q.eq(q.field("status"), "active"))
        .filter((q) => q.eq(q.field("accountId"), accountId))
        .first();

      if (existing) return existing._id;

      return await ctx.db.insert("conversations", {
        contactId: args.contactId,
        channel: "whatsapp",
        accountId,
        status: "active",
        ...(args.agentId && { agentId: args.agentId }),
      });
    }

    throw new ConvexError("Must provide userId for web or contactId for whatsapp");
  },
});

export const listByUser = authQuery({
  args: {},
  returns: v.array(conversationDoc),
  handler: async (ctx) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
      .collect();
  },
});

export const get = authQuery({
  args: { id: v.id("conversations") },
  returns: v.union(conversationDoc, v.null()),
  handler: async (ctx, args) => {
    return await getConversationIfOwnedByUser(ctx, ctx.auth.user._id, args.id);
  },
});

export const create = authMutation({
  args: {
    title: v.optional(v.string()),
  },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("conversations", {
      userId: ctx.auth.user._id,
      channel: "web",
      status: "active",
      title: args.title ?? "New chat",
    });
  },
});

export const archive = authMutation({
  args: { id: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conv = await getConversationIfOwnedByUser(ctx, ctx.auth.user._id, args.id);
    if (!conv || conv.channel === "whatsapp") return null;
    await ctx.db.patch(args.id, { status: "archived" });
  },
});

export const updateTitle = authMutation({
  args: {
    id: v.id("conversations"),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conv = await getConversationIfOwnedByUser(ctx, ctx.auth.user._id, args.id);
    if (!conv) return null;
    await ctx.db.patch(args.id, { title: args.title });
  },
});

export const listRecentWithLastMessage = authQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("conversations"),
      _creationTime: v.number(),
      channel: v.union(v.literal("whatsapp"), v.literal("web")),
      userId: v.optional(v.id("users")),
      contactId: v.optional(v.id("contacts")),
      agentId: v.optional(v.id("agents")),
      accountId: v.optional(v.string()),
      title: v.optional(v.string()),
      status: v.union(v.literal("active"), v.literal("archived")),
      lastMessage: v.union(
        v.object({
          content: v.string(),
          role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
          createdAt: v.number(),
        }),
        v.null(),
      ),
    }),
  ),
  handler: async (ctx) => {
    // 1. Web conversations by userId
    const webConversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // 2. WhatsApp conversations via linked contacts
    const linkedContacts = await ctx.db
      .query("contacts")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
      .collect();

    const whatsappConversations = (
      await Promise.all(
        linkedContacts.map((contact) =>
          ctx.db
            .query("conversations")
            .withIndex("by_contactId", (q) => q.eq("contactId", contact._id))
            .filter((q) => q.eq(q.field("channel"), "whatsapp"))
            .filter((q) => q.eq(q.field("status"), "active"))
            .collect(),
        ),
      )
    ).flat();

    // 3. Deduplicate by _id
    const seen = new Set<string>();
    const allConversations = [...webConversations, ...whatsappConversations].filter((conv) => {
      if (seen.has(conv._id)) return false;
      seen.add(conv._id);
      return true;
    });

    // 4. Attach last message and sort by recency
    const results = await Promise.all(
      allConversations.map(async (conv) => {
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
