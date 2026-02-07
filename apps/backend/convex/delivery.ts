import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { isValidServiceKey } from "./lib/auth";

const outboundStatus = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("sent"),
  v.literal("failed"),
);

const outboundDoc = v.object({
  _id: v.id("outboundMessages"),
  _creationTime: v.number(),
  channel: v.union(v.literal("web"), v.literal("whatsapp")),
  accountId: v.optional(v.string()),
  conversationId: v.id("conversations"),
  messageId: v.id("messages"),
  to: v.optional(v.string()),
  payload: v.object({
    content: v.string(),
    metadata: v.optional(v.any()),
  }),
  status: outboundStatus,
  processorId: v.optional(v.string()),
  lockedUntil: v.optional(v.number()),
  attemptCount: v.optional(v.number()),
  lastError: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const enqueueOutbound = mutation({
  args: {
    serviceKey: v.optional(v.string()),
    channel: v.union(v.literal("web"), v.literal("whatsapp")),
    accountId: v.optional(v.string()),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    to: v.optional(v.string()),
    content: v.string(),
    metadata: v.optional(v.any()),
  },
  returns: v.union(v.id("outboundMessages"), v.null()),
  handler: async (ctx, args) => {
    if (!isValidServiceKey(args.serviceKey)) return null;
    const now = Date.now();
    return await ctx.db.insert("outboundMessages", {
      channel: args.channel,
      accountId: args.accountId,
      conversationId: args.conversationId,
      messageId: args.messageId,
      to: args.to,
      payload: {
        content: args.content,
        metadata: args.metadata,
      },
      status: "pending",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const claimNextOutbound = mutation({
  args: {
    serviceKey: v.optional(v.string()),
    processorId: v.string(),
    channel: v.union(v.literal("web"), v.literal("whatsapp")),
    accountId: v.optional(v.string()),
    lockMs: v.optional(v.number()),
  },
  returns: v.union(outboundDoc, v.null()),
  handler: async (ctx, args) => {
    if (!isValidServiceKey(args.serviceKey)) return null;
    const now = Date.now();
    const lockMs = Math.max(1_000, args.lockMs ?? 30_000);

    const processing =
      args.accountId === undefined
        ? await ctx.db
            .query("outboundMessages")
            .withIndex("by_status_accountId", (q) =>
              q.eq("status", "processing").eq("accountId", undefined),
            )
            .collect()
        : await ctx.db
            .query("outboundMessages")
            .withIndex("by_status_accountId", (q) =>
              q.eq("status", "processing").eq("accountId", args.accountId),
            )
            .collect();

    for (const job of processing) {
      if (job.lockedUntil !== undefined && job.lockedUntil <= now) {
        await ctx.db.patch(job._id, {
          status: "pending",
          processorId: undefined,
          lockedUntil: undefined,
          updatedAt: now,
        });
      }
    }

    const pending =
      args.accountId === undefined
        ? await ctx.db
            .query("outboundMessages")
            .withIndex("by_status_accountId", (q) =>
              q.eq("status", "pending").eq("accountId", undefined),
            )
            .collect()
        : await ctx.db
            .query("outboundMessages")
            .withIndex("by_status_accountId", (q) =>
              q.eq("status", "pending").eq("accountId", args.accountId),
            )
            .collect();

    const next = pending
      .filter((job) => job.channel === args.channel)
      .sort((a, b) => a.createdAt - b.createdAt)[0];

    if (!next) return null;

    await ctx.db.patch(next._id, {
      status: "processing",
      processorId: args.processorId,
      lockedUntil: now + lockMs,
      updatedAt: now,
    });

    const claimed = await ctx.db.get(next._id);
    return claimed ?? null;
  },
});

export const completeOutbound = mutation({
  args: { serviceKey: v.optional(v.string()), id: v.id("outboundMessages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!isValidServiceKey(args.serviceKey)) return null;
    await ctx.db.patch(args.id, {
      status: "sent",
      updatedAt: Date.now(),
      lockedUntil: undefined,
      processorId: undefined,
      lastError: undefined,
    });
  },
});

export const failOutbound = mutation({
  args: {
    serviceKey: v.optional(v.string()),
    id: v.id("outboundMessages"),
    error: v.string(),
    retry: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!isValidServiceKey(args.serviceKey)) return null;
    const now = Date.now();
    const current = await ctx.db.get(args.id);
    if (!current) return null;

    const attemptCount = (current.attemptCount ?? 0) + 1;
    const shouldRetry = args.retry ?? attemptCount < 5;

    await ctx.db.patch(args.id, {
      status: shouldRetry ? "pending" : "failed",
      attemptCount,
      lastError: args.error.slice(0, 500),
      updatedAt: now,
      lockedUntil: undefined,
      processorId: undefined,
    });
  },
});

export const listPendingByConversation = query({
  args: { serviceKey: v.optional(v.string()), conversationId: v.id("conversations") },
  returns: v.array(outboundDoc),
  handler: async (ctx, args) => {
    if (!isValidServiceKey(args.serviceKey)) return [];
    const all = await ctx.db
      .query("outboundMessages")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
      .collect();
    return all.filter((o) => o.status === "pending" || o.status === "processing");
  },
});
