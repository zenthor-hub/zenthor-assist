import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { resolveRoleForEmail } from "./auth";

/**
 * Backfill missing user roles. Safe to run multiple times.
 */
export const backfillUserRoles = internalMutation({
  args: {},
  returns: v.object({
    updated: v.number(),
    total: v.number(),
  }),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let updated = 0;

    for (const user of users) {
      if (user.role === "admin" || user.role === "member") {
        continue;
      }
      await ctx.db.patch(user._id, {
        role: resolveRoleForEmail(user.email),
        updatedAt: Date.now(),
      });
      updated += 1;
    }

    return { updated, total: users.length };
  },
});

/**
 * Backfill unowned skills to a specific owner user. Safe to run multiple times.
 */
export const backfillSkillOwners = internalMutation({
  args: {
    ownerUserId: v.id("users"),
  },
  returns: v.object({
    updated: v.number(),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    const skills = await ctx.db.query("skills").collect();
    let updated = 0;

    for (const skill of skills) {
      if (skill.ownerUserId !== undefined) continue;
      await ctx.db.patch(skill._id, {
        ownerUserId: args.ownerUserId,
      });
      updated += 1;
    }

    return { updated, total: skills.length };
  },
});
