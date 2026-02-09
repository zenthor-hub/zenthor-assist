import { ConvexError, v } from "convex/values";

import { authMutation, authQuery, serviceMutation } from "./auth";
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

const mediaValidator = v.optional(
  v.object({
    type: v.union(
      v.literal("audio"),
      v.literal("image"),
      v.literal("video"),
      v.literal("document"),
    ),
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
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
  content: v.string(),
  channel: v.union(v.literal("whatsapp"), v.literal("web")),
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

export const send = authMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    channel: v.optional(v.union(v.literal("whatsapp"), v.literal("web"))),
  },
  returns: v.union(v.id("messages"), v.null()),
  handler: async (ctx, args) => {
    const conv = await getConversationIfOwnedByUser(ctx, ctx.auth.user._id, args.conversationId);
    if (!conv) return null;

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "user",
      content: args.content,
      channel: conv.channel,
      status: "sent",
    });

    if (!conv.title || conv.title === "New chat") {
      const title = args.content.length > 50 ? `${args.content.slice(0, 50)}…` : args.content;
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
    channel: v.optional(v.union(v.literal("whatsapp"), v.literal("web"))),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new ConvexError("Conversation not found");
    }

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "user",
      content: args.content,
      channel: conversation.channel,
      status: "sent",
    });

    if (!conversation.title || conversation.title === "New chat") {
      const title = args.content.length > 50 ? `${args.content.slice(0, 50)}…` : args.content;
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
    channel: v.optional(v.union(v.literal("whatsapp"), v.literal("web"))),
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

export const updateMediaTranscript = serviceMutation({
  args: {
    messageId: v.id("messages"),
    transcript: v.string(),
    mediaUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg?.media) return null;

    await ctx.db.patch(args.messageId, {
      content: args.transcript,
      media: { ...msg.media, transcript: args.transcript, url: args.mediaUrl },
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
