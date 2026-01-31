import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getPendingJobs = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("agentQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});

export const claimJob = mutation({
  args: { jobId: v.id("agentQueue") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "pending") return null;

    await ctx.db.patch(args.jobId, { status: "processing" });
    return job;
  },
});

export const completeJob = mutation({
  args: { jobId: v.id("agentQueue") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, { status: "completed" });
  },
});

export const failJob = mutation({
  args: { jobId: v.id("agentQueue") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, { status: "failed" });
  },
});

export const getConversationContext = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return null;

    const contact = await ctx.db.get(conversation.contactId);
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    const skills = await ctx.db
      .query("skills")
      .filter((q) => q.eq(q.field("enabled"), true))
      .collect();

    return { conversation, contact, messages, skills };
  },
});
