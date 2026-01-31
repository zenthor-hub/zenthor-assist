import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contacts")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
  },
});

export const getByClerkUserId = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contacts")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
  },
});

export const getOrCreateFromClerk = mutation({
  args: {
    clerkUserId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("contacts")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("contacts", {
      clerkUserId: args.clerkUserId,
      name: args.name,
      isAllowed: true,
      channel: "web",
    });
  },
});

export const create = mutation({
  args: {
    phone: v.optional(v.string()),
    name: v.string(),
    isAllowed: v.boolean(),
    channel: v.union(v.literal("whatsapp"), v.literal("web")),
    clerkUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("contacts", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("contacts"),
    name: v.optional(v.string()),
    isAllowed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("contacts").collect();
  },
});
