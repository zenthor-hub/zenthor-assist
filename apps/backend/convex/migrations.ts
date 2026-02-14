import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
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
 * Fix orphaned streaming messages stuck with streaming=true.
 * These occur when a job fails after creating a placeholder but
 * before finalizing the message. Safe to run multiple times.
 */
export const fixOrphanedStreamingMessages = internalMutation({
  args: {},
  returns: v.object({
    updated: v.number(),
    total: v.number(),
  }),
  handler: async (ctx) => {
    const messages = await ctx.db.query("messages").collect();
    let updated = 0;

    for (const msg of messages) {
      if (msg.streaming === true) {
        await ctx.db.patch(msg._id, {
          streaming: false,
          status: "failed",
          content: msg.content || "Sorry, something went wrong. Please try again.",
        });
        updated += 1;
      }
    }

    return { updated, total: messages.length };
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

/**
 * Backfill onboarding rows for users linked to existing WhatsApp contacts.
 * Safe to run multiple times.
 */
export const backfillWhatsAppOnboarding = internalMutation({
  args: {},
  returns: v.object({
    processedUsers: v.number(),
    createdOnboarding: v.number(),
    alreadyHadOnboarding: v.number(),
  }),
  handler: async (ctx) => {
    const contacts = await ctx.db.query("contacts").collect();
    const linkedUserIds = new Set<Id<"users">>();

    for (const contact of contacts) {
      if (contact.userId) {
        linkedUserIds.add(contact.userId);
      }
    }

    let createdOnboarding = 0;
    let alreadyHadOnboarding = 0;
    const now = Date.now();

    for (const userId of linkedUserIds) {
      const existing = await ctx.db
        .query("userOnboarding")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();

      if (existing) {
        alreadyHadOnboarding += 1;
        continue;
      }

      await ctx.db.insert("userOnboarding", {
        userId,
        status: "pending",
        currentStep: "preferredName",
        updatedAt: now,
      });
      createdOnboarding += 1;
    }

    return {
      processedUsers: linkedUserIds.size,
      createdOnboarding,
      alreadyHadOnboarding,
    };
  },
});
