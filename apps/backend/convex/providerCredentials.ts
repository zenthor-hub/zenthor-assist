import { v } from "convex/values";

import { serviceMutation, serviceQuery } from "./auth";

/**
 * Retrieve stored credentials for a given AI provider.
 * Returns null if no credentials exist for that provider.
 */
export const getByProvider = serviceQuery({
  args: { provider: v.string() },
  returns: v.union(
    v.object({
      accessToken: v.string(),
      refreshToken: v.string(),
      expiresAt: v.number(),
      accountId: v.optional(v.string()),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("providerCredentials")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .first();

    if (!doc) return null;

    return {
      accessToken: doc.accessToken,
      refreshToken: doc.refreshToken,
      expiresAt: doc.expiresAt,
      accountId: doc.accountId,
      updatedAt: doc.updatedAt,
    };
  },
});

/**
 * Insert or update credentials for a provider.
 * Uses upsert semantics: creates if not found, patches if exists.
 */
export const upsertByProvider = serviceMutation({
  args: {
    provider: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    accountId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerCredentials")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
        accountId: args.accountId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("providerCredentials", {
        provider: args.provider,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
        accountId: args.accountId,
        updatedAt: now,
      });
    }

    return null;
  },
});

/**
 * Remove stored credentials for a provider.
 */
export const clearByProvider = serviceMutation({
  args: { provider: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerCredentials")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return null;
  },
});
