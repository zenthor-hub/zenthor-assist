import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { resolveRoleForEmail } from "../auth";

export const handleUserCreated = internalMutation({
  args: {
    externalId: v.string(),
    name: v.string(),
    email: v.string(),
    image: v.optional(v.string()),
  },
  returns: v.object({
    userId: v.id("users"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email.toLowerCase(),
        role: existing.role ?? resolveRoleForEmail(args.email),
        image: args.image,
        updatedAt: Date.now(),
      });
      return { userId: existing._id, created: false };
    }

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      externalId: args.externalId,
      name: args.name,
      email: args.email.toLowerCase(),
      role: resolveRoleForEmail(args.email),
      image: args.image,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    return { userId, created: true };
  },
});

export const handleUserUpdated = internalMutation({
  args: {
    externalId: v.string(),
    name: v.string(),
    email: v.string(),
    image: v.optional(v.string()),
  },
  returns: v.object({
    userId: v.id("users"),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email.toLowerCase(),
        role: existing.role ?? resolveRoleForEmail(args.email),
        image: args.image,
        updatedAt: now,
      });
      return { userId: existing._id };
    }

    const userId = await ctx.db.insert("users", {
      externalId: args.externalId,
      name: args.name,
      email: args.email.toLowerCase(),
      role: resolveRoleForEmail(args.email),
      image: args.image,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    return { userId };
  },
});

export const handleUserDeleted = internalMutation({
  args: {
    externalId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "inactive",
        updatedAt: Date.now(),
      });
    }
  },
});
