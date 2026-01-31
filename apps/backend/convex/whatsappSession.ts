import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("whatsappSession")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    return doc?.data ?? null;
  },
});

export const set = mutation({
  args: { key: v.string(), data: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("whatsappSession")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { data: args.data });
    } else {
      await ctx.db.insert("whatsappSession", {
        key: args.key,
        data: args.data,
      });
    }
  },
});

export const remove = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("whatsappSession")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("whatsappSession").collect();
  },
});
