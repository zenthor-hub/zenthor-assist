import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("skills").collect();
  },
});

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("skills")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    enabled: v.boolean(),
    config: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("skills", args);
  },
});

export const toggle = mutation({
  args: { id: v.id("skills") },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.id);
    if (!skill) return;
    await ctx.db.patch(args.id, { enabled: !skill.enabled });
  },
});

export const update = mutation({
  args: {
    id: v.id("skills"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    config: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const remove = mutation({
  args: { id: v.id("skills") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
