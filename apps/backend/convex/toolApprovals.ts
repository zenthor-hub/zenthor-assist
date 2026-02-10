import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { authMutation, authQuery, serviceMutation, serviceQuery } from "./auth";
import { classifyApprovalText } from "./lib/approvalKeywords";
import { getConversationIfOwnedByUser } from "./lib/auth";

/** Must match APPROVAL_TIMEOUT_MS in apps/agent/src/agent/tool-approval.ts */
const APPROVAL_TTL_MS = 5 * 60 * 1_000;

const toolApprovalDoc = v.object({
  _id: v.id("toolApprovals"),
  _creationTime: v.number(),
  conversationId: v.id("conversations"),
  jobId: v.id("agentQueue"),
  toolName: v.string(),
  toolInput: v.any(),
  status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
  channel: v.union(v.literal("web"), v.literal("whatsapp")),
  createdAt: v.number(),
  resolvedAt: v.optional(v.number()),
});

export const create = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    jobId: v.id("agentQueue"),
    toolName: v.string(),
    toolInput: v.any(),
    channel: v.union(v.literal("web"), v.literal("whatsapp")),
  },
  returns: v.id("toolApprovals"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("toolApprovals", {
      conversationId: args.conversationId,
      jobId: args.jobId,
      toolName: args.toolName,
      toolInput: args.toolInput,
      status: "pending",
      channel: args.channel,
      createdAt: Date.now(),
    });
  },
});

export const resolve = authMutation({
  args: {
    approvalId: v.id("toolApprovals"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
  },
  returns: v.union(toolApprovalDoc, v.null()),
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval || approval.status !== "pending") return null;

    const conv = await getConversationIfOwnedByUser(
      ctx,
      ctx.auth.user._id,
      approval.conversationId,
    );
    if (!conv) return null;

    await ctx.db.patch(args.approvalId, {
      status: args.status,
      resolvedAt: Date.now(),
    });

    return approval;
  },
});

export const resolveService = serviceMutation({
  args: {
    approvalId: v.id("toolApprovals"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
  },
  returns: v.union(toolApprovalDoc, v.null()),
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval || approval.status !== "pending") return null;
    await ctx.db.patch(args.approvalId, {
      status: args.status,
      resolvedAt: Date.now(),
    });
    return approval;
  },
});

export const getPendingByConversation = authQuery({
  args: { conversationId: v.id("conversations") },
  returns: v.array(toolApprovalDoc),
  handler: async (ctx, args) => {
    const conv = await getConversationIfOwnedByUser(ctx, ctx.auth.user._id, args.conversationId);
    if (!conv) return [];

    return await ctx.db
      .query("toolApprovals")
      .withIndex("by_conversationId_status", (q) =>
        q.eq("conversationId", args.conversationId).eq("status", "pending"),
      )
      .collect();
  },
});

export const getPendingByConversationService = serviceQuery({
  args: { conversationId: v.id("conversations") },
  returns: v.array(toolApprovalDoc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("toolApprovals")
      .withIndex("by_conversationId_status", (q) =>
        q.eq("conversationId", args.conversationId).eq("status", "pending"),
      )
      .collect();
  },
});

export const getPendingByJob = serviceQuery({
  args: { jobId: v.id("agentQueue") },
  returns: v.array(toolApprovalDoc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("toolApprovals")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});

export const getByJob = serviceQuery({
  args: { jobId: v.id("agentQueue") },
  returns: v.array(toolApprovalDoc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("toolApprovals")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();
  },
});

/**
 * Attempt to resolve the first pending approval for a conversation by interpreting
 * a user text/transcript as an approval keyword.
 * Returns the resolved approval doc or null if no match / no pending approvals.
 */
export const resolveByConversationText = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    text: v.string(),
  },
  returns: v.union(toolApprovalDoc, v.null()),
  handler: async (ctx, args) => {
    const status = classifyApprovalText(args.text);
    if (!status) return null;

    const pending = await ctx.db
      .query("toolApprovals")
      .withIndex("by_conversationId_status", (q) =>
        q.eq("conversationId", args.conversationId).eq("status", "pending"),
      )
      .first();

    if (!pending) return null;

    await ctx.db.patch(pending._id, { status, resolvedAt: Date.now() });
    return { ...pending, status };
  },
});

/** Expire pending approvals older than the approval timeout. Called by cron. */
export const expireStale = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - APPROVAL_TTL_MS;
    // Query all pending approvals (no status-only index, so scan by conversationId_status)
    // Use a broad query and filter by createdAt
    const stale = await ctx.db
      .query("toolApprovals")
      .filter((q) => q.and(q.eq(q.field("status"), "pending"), q.lt(q.field("createdAt"), cutoff)))
      .collect();

    for (const approval of stale) {
      await ctx.db.patch(approval._id, {
        status: "rejected",
        resolvedAt: Date.now(),
      });
    }

    return stale.length;
  },
});
