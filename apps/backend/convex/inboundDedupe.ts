import { v } from "convex/values";

import { internalMutation, mutation } from "./_generated/server";

/**
 * Atomic check-and-register for inbound message deduplication.
 * Returns `isDuplicate: true` if the message was already seen.
 * Convex mutations are serialized, so the read-then-write is atomic.
 */
export const checkAndRegister = mutation({
  args: {
    channel: v.union(v.literal("whatsapp"), v.literal("web")),
    channelMessageId: v.string(),
    accountId: v.optional(v.string()),
  },
  returns: v.object({ isDuplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("inboundDedupe")
      .withIndex("by_channel_messageId", (q) =>
        q.eq("channel", args.channel).eq("channelMessageId", args.channelMessageId),
      )
      .first();

    if (existing) {
      return { isDuplicate: true };
    }

    await ctx.db.insert("inboundDedupe", {
      channel: args.channel,
      channelMessageId: args.channelMessageId,
      accountId: args.accountId,
      createdAt: Date.now(),
    });

    return { isDuplicate: false };
  },
});

/** Delete dedupe entries older than the given TTL. Called by cron. */
export const cleanup = internalMutation({
  args: { olderThanMs: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const ttl = args.olderThanMs ?? 24 * 60 * 60 * 1000; // Default: 24 hours
    const cutoff = Date.now() - ttl;
    const stale = await ctx.db
      .query("inboundDedupe")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .collect();

    for (const doc of stale) {
      await ctx.db.delete(doc._id);
    }

    return stale.length;
  },
});
