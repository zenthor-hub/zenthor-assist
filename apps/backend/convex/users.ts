import { ConvexError, v } from "convex/values";

import { mutation } from "./_generated/server";
import { adminQuery, authQuery, resolveRoleForEmail } from "./auth";

const userDoc = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  externalId: v.string(),
  name: v.string(),
  email: v.string(),
  role: v.optional(v.union(v.literal("admin"), v.literal("member"))),
  emailVerified: v.optional(v.boolean()),
  image: v.optional(v.string()),
  phone: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("inactive")),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const getByExternalId = authQuery({
  args: { externalId: v.string() },
  returns: v.union(userDoc, v.null()),
  handler: async (ctx, args) => {
    if (ctx.auth.identitySubject !== args.externalId) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .first();
  },
});

export const getOrCreateFromClerk = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }
    const externalId = identity.subject;
    const role = resolveRoleForEmail(args.email);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
      .first();

    if (existing) {
      if (!existing.role) {
        await ctx.db.patch(existing._id, { role, updatedAt: Date.now() });
      }
      const onboarding = await ctx.db
        .query("userOnboarding")
        .withIndex("by_userId", (q) => q.eq("userId", existing._id))
        .unique();
      if (!onboarding) {
        await ctx.db.insert("userOnboarding", {
          userId: existing._id,
          status: "pending",
          currentStep: "preferredName",
          updatedAt: Date.now(),
        });
      }
      return existing._id;
    }

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      externalId,
      name: args.name,
      email: args.email ?? "",
      role,
      image: args.image,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("userOnboarding", {
      userId,
      status: "pending",
      currentStep: "preferredName",
      updatedAt: now,
    });

    return userId;
  },
});

export const getCurrentUser = authQuery({
  args: {},
  returns: v.union(userDoc, v.null()),
  handler: async (ctx) => {
    return ctx.auth.user;
  },
});

export const me = authQuery({
  args: {},
  returns: v.union(userDoc, v.null()),
  handler: async (ctx) => {
    return ctx.auth.user;
  },
});

export const list = adminQuery({
  args: {},
  returns: v.array(userDoc),
  handler: async (ctx) => {
    return await ctx.db.query("users").collect();
  },
});
