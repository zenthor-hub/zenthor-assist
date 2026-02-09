import { ConvexError, v } from "convex/values";

import { authMutation, authQuery } from "./auth";

export const list = authQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("taskProjects")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
      .collect();
  },
});

export const create = authMutation({
  args: {
    name: v.string(),
    color: v.optional(v.string()),
    parentId: v.optional(v.id("taskProjects")),
    isFavorite: v.optional(v.boolean()),
    viewStyle: v.optional(v.union(v.literal("list"), v.literal("board"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("taskProjects", {
      userId: ctx.auth.user._id,
      name: args.name,
      color: args.color,
      parentId: args.parentId,
      isFavorite: args.isFavorite,
      viewStyle: args.viewStyle ?? "list",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = authMutation({
  args: {
    id: v.id("taskProjects"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    order: v.optional(v.number()),
    isFavorite: v.optional(v.boolean()),
    viewStyle: v.optional(v.union(v.literal("list"), v.literal("board"))),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== ctx.auth.user._id) {
      throw new ConvexError("Project not found");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name;
    if (args.color !== undefined) patch.color = args.color;
    if (args.order !== undefined) patch.order = args.order;
    if (args.isFavorite !== undefined) patch.isFavorite = args.isFavorite;
    if (args.viewStyle !== undefined) patch.viewStyle = args.viewStyle;

    await ctx.db.patch(args.id, patch);
  },
});

export const remove = authMutation({
  args: { id: v.id("taskProjects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== ctx.auth.user._id) {
      throw new ConvexError("Project not found");
    }
    await ctx.db.delete(args.id);
  },
});
