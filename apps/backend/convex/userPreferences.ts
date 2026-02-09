import { v } from "convex/values";

import { authMutation, authQuery, serviceQuery } from "./auth";

export const get = authQuery({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("userPreferences"),
      _creationTime: v.number(),
      userId: v.id("users"),
      showModelInfo: v.optional(v.boolean()),
      showToolDetails: v.optional(v.boolean()),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    return await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
      .unique();
  },
});

export const upsert = authMutation({
  args: {
    showModelInfo: v.optional(v.boolean()),
    showToolDetails: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: ctx.auth.user._id,
        ...args,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const getByUserId = serviceQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      _id: v.id("userPreferences"),
      _creationTime: v.number(),
      userId: v.id("users"),
      showModelInfo: v.optional(v.boolean()),
      showToolDetails: v.optional(v.boolean()),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});
