import { v } from "convex/values";

import { internalMutation, mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("scheduledTasks").collect();
  },
});

export const get = query({
  args: { id: v.id("scheduledTasks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    cronExpression: v.optional(v.string()),
    intervalMs: v.optional(v.number()),
    payload: v.any(),
    enabled: v.boolean(),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const nextRunAt = args.intervalMs ? now + args.intervalMs : undefined;
    return await ctx.db.insert("scheduledTasks", {
      ...args,
      createdAt: now,
      nextRunAt,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("scheduledTasks"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    cronExpression: v.optional(v.string()),
    intervalMs: v.optional(v.number()),
    payload: v.optional(v.any()),
    enabled: v.optional(v.boolean()),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const task = await ctx.db.get(id);
    if (!task) throw new Error("Scheduled task not found");

    // Recompute nextRunAt if intervalMs changed
    const patch: Record<string, unknown> = { ...fields };
    if (fields.intervalMs !== undefined) {
      patch.nextRunAt = Date.now() + fields.intervalMs;
    }

    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("scheduledTasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const cleanupOldJobs = internalMutation({
  handler: async (ctx) => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const oldJobs = await ctx.db
      .query("agentQueue")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();
    let deleted = 0;
    for (const job of oldJobs) {
      if (job._creationTime < sevenDaysAgo) {
        await ctx.db.delete(job._id);
        deleted++;
      }
    }
    if (deleted > 0) {
      console.info(`[cron] Cleaned up ${deleted} old completed jobs`);
    }
  },
});

export const processDueTasks = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const dueTasks = await ctx.db
      .query("scheduledTasks")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    for (const task of dueTasks) {
      if (task.nextRunAt && task.nextRunAt <= now) {
        // Update lastRunAt and compute next run
        const nextRunAt = task.intervalMs ? now + task.intervalMs : undefined;
        await ctx.db.patch(task._id, {
          lastRunAt: now,
          nextRunAt,
        });

        // If the task has a conversationId, create an agent job
        if (task.conversationId) {
          const messageId = await ctx.db.insert("messages", {
            conversationId: task.conversationId,
            role: "system",
            content: `[Scheduled Task: ${task.name}] ${typeof task.payload === "string" ? task.payload : JSON.stringify(task.payload)}`,
            channel: "web",
            status: "sent",
          });
          await ctx.db.insert("agentQueue", {
            messageId,
            conversationId: task.conversationId,
            status: "pending",
          });
          console.info(
            `[cron] Triggered scheduled task "${task.name}" for conversation ${task.conversationId}`,
          );
        }
      }
    }
  },
});
