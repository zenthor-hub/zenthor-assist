import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
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

type TableSummary = { table: string; deleted: number };

type DeletableRow = { _id: unknown };

async function clearTable(
  ctx: MutationCtx,
  rows: Promise<readonly DeletableRow[]>,
  tableName: string,
  dryRun: boolean,
): Promise<TableSummary> {
  const docs = await rows;
  if (!dryRun) {
    for (const doc of docs) {
      await ctx.db.delete(doc._id as never);
    }
  }
  return { table: tableName, deleted: docs.length };
}

async function wipeAllData(
  ctx: MutationCtx,
  dryRun: boolean,
): Promise<{
  dryRun: boolean;
  totalDeleted: number;
  tables: TableSummary[];
}> {
  const tableJobs = [
    clearTable(ctx, ctx.db.query("users").collect(), "users", dryRun),
    clearTable(ctx, ctx.db.query("contacts").collect(), "contacts", dryRun),
    clearTable(ctx, ctx.db.query("phoneVerifications").collect(), "phoneVerifications", dryRun),
    clearTable(ctx, ctx.db.query("conversations").collect(), "conversations", dryRun),
    clearTable(ctx, ctx.db.query("messages").collect(), "messages", dryRun),
    clearTable(ctx, ctx.db.query("noteFolders").collect(), "noteFolders", dryRun),
    clearTable(ctx, ctx.db.query("notes").collect(), "notes", dryRun),
    clearTable(ctx, ctx.db.query("userPreferences").collect(), "userPreferences", dryRun),
    clearTable(ctx, ctx.db.query("userOnboarding").collect(), "userOnboarding", dryRun),
    clearTable(ctx, ctx.db.query("skills").collect(), "skills", dryRun),
    clearTable(ctx, ctx.db.query("todoistConnections").collect(), "todoistConnections", dryRun),
    clearTable(ctx, ctx.db.query("todoistOauthStates").collect(), "todoistOauthStates", dryRun),
    clearTable(ctx, ctx.db.query("whatsappSession").collect(), "whatsappSession", dryRun),
    clearTable(ctx, ctx.db.query("whatsappAccounts").collect(), "whatsappAccounts", dryRun),
    clearTable(ctx, ctx.db.query("whatsappLeases").collect(), "whatsappLeases", dryRun),
    clearTable(ctx, ctx.db.query("agentQueue").collect(), "agentQueue", dryRun),
    clearTable(ctx, ctx.db.query("agents").collect(), "agents", dryRun),
    clearTable(ctx, ctx.db.query("memories").collect(), "memories", dryRun),
    clearTable(ctx, ctx.db.query("scheduledTasks").collect(), "scheduledTasks", dryRun),
    clearTable(ctx, ctx.db.query("toolApprovals").collect(), "toolApprovals", dryRun),
    clearTable(ctx, ctx.db.query("outboundMessages").collect(), "outboundMessages", dryRun),
    clearTable(ctx, ctx.db.query("pluginDefinitions").collect(), "pluginDefinitions", dryRun),
    clearTable(ctx, ctx.db.query("pluginInstalls").collect(), "pluginInstalls", dryRun),
    clearTable(ctx, ctx.db.query("pluginPolicies").collect(), "pluginPolicies", dryRun),
    clearTable(ctx, ctx.db.query("tasks").collect(), "tasks", dryRun),
    clearTable(ctx, ctx.db.query("taskProjects").collect(), "taskProjects", dryRun),
    clearTable(ctx, ctx.db.query("taskSections").collect(), "taskSections", dryRun),
    clearTable(ctx, ctx.db.query("inboundDedupe").collect(), "inboundDedupe", dryRun),
    clearTable(ctx, ctx.db.query("providerCredentials").collect(), "providerCredentials", dryRun),
  ];

  const summaries = await Promise.all(tableJobs);
  const totalDeleted = summaries.reduce((sum, row) => sum + row.deleted, 0);

  return {
    dryRun,
    totalDeleted,
    tables: summaries,
  };
}

export const wipeEnvironment = internalMutation({
  args: {
    confirmToken: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    dryRun: v.boolean(),
    totalDeleted: v.number(),
    tables: v.array(
      v.object({
        table: v.string(),
        deleted: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    if (args.confirmToken !== "WIPE_ENVIRONMENT_2026") {
      throw new ConvexError("Invalid confirm token. Use WIPE_ENVIRONMENT_2026");
    }

    return await wipeAllData(ctx, args.dryRun ?? false);
  },
});
