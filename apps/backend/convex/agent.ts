import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import {
  canRetry,
  DEFAULT_JOB_LOCK_MS,
  hasActiveJobForConversation,
  isHeartbeatValid,
  isJobStale,
  resolveStaleAction,
} from "./agent_queue_helpers";
import { authQuery, serviceMutation, serviceQuery } from "./auth";
import { getConversationIfOwnedByUser } from "./lib/auth";

const agentQueueDoc = v.object({
  _id: v.id("agentQueue"),
  _creationTime: v.number(),
  messageId: v.id("messages"),
  conversationId: v.id("conversations"),
  agentId: v.optional(v.id("agents")),
  parentJobId: v.optional(v.id("agentQueue")),
  rootJobId: v.optional(v.id("agentQueue")),
  isInternal: v.optional(v.boolean()),
  delegationDepth: v.optional(v.number()),
  result: v.optional(v.string()),
  status: v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("completed"),
    v.literal("failed"),
  ),
  errorReason: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  attemptCount: v.optional(v.number()),
  modelUsed: v.optional(v.string()),
  processorId: v.optional(v.string()),
  lockedUntil: v.optional(v.number()),
  startedAt: v.optional(v.number()),
  lastHeartbeatAt: v.optional(v.number()),
});

const toolPolicyValidator = v.optional(
  v.object({
    allow: v.optional(v.array(v.string())),
    deny: v.optional(v.array(v.string())),
  }),
);

const skillDoc = v.object({
  _id: v.id("skills"),
  _creationTime: v.number(),
  ownerUserId: v.optional(v.id("users")),
  name: v.string(),
  description: v.string(),
  enabled: v.boolean(),
  config: v.optional(
    v.object({
      systemPrompt: v.optional(v.string()),
      toolPolicy: v.optional(
        v.object({
          allow: v.optional(v.array(v.string())),
          deny: v.optional(v.array(v.string())),
        }),
      ),
    }),
  ),
});

const agentDoc = v.object({
  _id: v.id("agents"),
  _creationTime: v.number(),
  name: v.string(),
  description: v.string(),
  systemPrompt: v.string(),
  model: v.optional(v.string()),
  fallbackModel: v.optional(v.string()),
  enabled: v.boolean(),
  toolPolicy: toolPolicyValidator,
});

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

const contactDoc = v.object({
  _id: v.id("contacts"),
  _creationTime: v.number(),
  phone: v.string(),
  name: v.string(),
  isAllowed: v.boolean(),
  userId: v.optional(v.id("users")),
});

const conversationDoc = v.object({
  _id: v.id("conversations"),
  _creationTime: v.number(),
  channel: v.union(v.literal("whatsapp"), v.literal("web"), v.literal("telegram")),
  userId: v.optional(v.id("users")),
  contactId: v.optional(v.id("contacts")),
  agentId: v.optional(v.id("agents")),
  accountId: v.optional(v.string()),
  title: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("archived")),
});

const noteContextDoc = v.object({
  noteId: v.id("notes"),
  title: v.string(),
  contentPreview: v.string(),
});

const messageDoc = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  conversationId: v.id("conversations"),
  noteId: v.optional(v.id("notes")),
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
  content: v.string(),
  channel: v.union(v.literal("whatsapp"), v.literal("web"), v.literal("telegram")),
  toolCalls: v.optional(v.any()),
  media: v.optional(
    v.object({
      type: v.union(
        v.literal("audio"),
        v.literal("image"),
        v.literal("video"),
        v.literal("document"),
      ),
      sourceId: v.string(),
      mimetype: v.string(),
      url: v.optional(v.string()),
      transcript: v.optional(v.string()),
    }),
  ),
  modelUsed: v.optional(v.string()),
  streaming: v.optional(v.boolean()),
  status: v.union(
    v.literal("pending"),
    v.literal("sent"),
    v.literal("delivered"),
    v.literal("failed"),
  ),
});

export const getPendingJobs = serviceQuery({
  args: {},
  returns: v.array(agentQueueDoc),
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("agentQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const processing = await ctx.db
      .query("agentQueue")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .collect();

    const byId = new Map<string, (typeof pending)[number]>();
    for (const job of pending) byId.set(job._id, job);
    for (const job of processing) byId.set(job._id, job);

    return [...byId.values()];
  },
});

export const getAgentJob = serviceQuery({
  args: { jobId: v.id("agentQueue") },
  returns: v.union(agentQueueDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const createInternalJob = serviceMutation({
  args: {
    parentJobId: v.id("agentQueue"),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
  },
  returns: v.union(v.id("agentQueue"), v.null()),
  handler: async (ctx, args) => {
    const parentJob = await ctx.db.get(args.parentJobId);
    const systemMessage = await ctx.db.get(args.messageId);
    const conversation = await ctx.db.get(args.conversationId);

    if (!parentJob || !systemMessage || !conversation) return null;
    if (systemMessage.conversationId !== args.conversationId) return null;
    if (parentJob.conversationId !== args.conversationId) return null;

    const delegationDepth = (parentJob.delegationDepth ?? 0) + 1;
    const rootJobId = parentJob.rootJobId ?? args.parentJobId;

    return await ctx.db.insert("agentQueue", {
      messageId: args.messageId,
      conversationId: args.conversationId,
      agentId: parentJob.agentId,
      parentJobId: args.parentJobId,
      rootJobId,
      isInternal: true,
      delegationDepth,
      status: "pending",
      attemptCount: 0,
    });
  },
});

export const claimJob = serviceMutation({
  args: {
    jobId: v.id("agentQueue"),
    processorId: v.string(),
    lockMs: v.optional(v.number()),
  },
  returns: v.union(agentQueueDoc, v.null()),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "pending") return null;

    const now = Date.now();
    const lockMs = args.lockMs ?? DEFAULT_JOB_LOCK_MS;

    // Inline stale cleanup: requeue expired processing jobs
    const processingJobs = await ctx.db
      .query("agentQueue")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .collect();

    for (const stale of processingJobs) {
      if (!isJobStale(stale, now)) continue;

      const action = resolveStaleAction(stale.attemptCount);
      if (action === "fail") {
        await ctx.db.patch(stale._id, {
          status: "failed",
          errorReason: "stale_lease",
          errorMessage: "Job exceeded max attempts after lease expiry",
          processorId: undefined,
          lockedUntil: undefined,
        });
      } else {
        await ctx.db.patch(stale._id, {
          status: "pending",
          attemptCount: (stale.attemptCount ?? 0) + 1,
          processorId: undefined,
          lockedUntil: undefined,
          startedAt: undefined,
          lastHeartbeatAt: undefined,
        });
      }
    }

    // Per-conversation guard: reject if another non-expired processing job exists
    const conversationJobs = await ctx.db
      .query("agentQueue")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", job.conversationId))
      .collect();

    const canRunConcurrentInternalJobs = job.isInternal === true;
    if (
      hasActiveJobForConversation(conversationJobs, args.jobId, now, {
        allowConcurrentInternalJobs: canRunConcurrentInternalJobs,
      })
    )
      return null;

    await ctx.db.patch(args.jobId, {
      status: "processing",
      processorId: args.processorId,
      lockedUntil: now + lockMs,
      startedAt: now,
      lastHeartbeatAt: now,
    });
    return { ...job, status: "processing" as const };
  },
});

export const completeJob = serviceMutation({
  args: {
    jobId: v.id("agentQueue"),
    modelUsed: v.optional(v.string()),
    result: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "processing") return false;

    await ctx.db.patch(args.jobId, {
      status: "completed",
      modelUsed: args.modelUsed,
      result: args.result,
      processorId: undefined,
      lockedUntil: undefined,
    });
    return true;
  },
});

export const failJob = serviceMutation({
  args: {
    jobId: v.id("agentQueue"),
    errorReason: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "processing") return false;

    await ctx.db.patch(args.jobId, {
      status: "failed",
      errorReason: args.errorReason,
      errorMessage: args.errorMessage,
      processorId: undefined,
      lockedUntil: undefined,
    });
    return true;
  },
});

export const retryJob = serviceMutation({
  args: { jobId: v.id("agentQueue") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return false;
    if (!canRetry(job.attemptCount)) return false;
    await ctx.db.patch(args.jobId, {
      status: "pending",
      attemptCount: (job.attemptCount ?? 0) + 1,
      errorReason: undefined,
      errorMessage: undefined,
      processorId: undefined,
      lockedUntil: undefined,
      startedAt: undefined,
      lastHeartbeatAt: undefined,
    });
    return true;
  },
});

export const heartbeatJob = serviceMutation({
  args: {
    jobId: v.id("agentQueue"),
    processorId: v.string(),
    lockMs: v.optional(v.number()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return false;
    if (!isHeartbeatValid(job, args.processorId, Date.now())) return false;

    const lockMs = args.lockMs ?? DEFAULT_JOB_LOCK_MS;
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      lockedUntil: now + lockMs,
      lastHeartbeatAt: now,
    });
    return true;
  },
});

export const requeueStaleJobs = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const processingJobs = await ctx.db
      .query("agentQueue")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .collect();

    for (const job of processingJobs) {
      if (!isJobStale(job, now)) continue;

      const action = resolveStaleAction(job.attemptCount);
      if (action === "fail") {
        await ctx.db.patch(job._id, {
          status: "failed",
          errorReason: "stale_lease",
          errorMessage: "Job exceeded max attempts after lease expiry",
          processorId: undefined,
          lockedUntil: undefined,
        });
      } else {
        await ctx.db.patch(job._id, {
          status: "pending",
          attemptCount: (job.attemptCount ?? 0) + 1,
          processorId: undefined,
          lockedUntil: undefined,
          startedAt: undefined,
          lastHeartbeatAt: undefined,
        });
      }
    }
    return null;
  },
});

export const isProcessing = authQuery({
  args: { conversationId: v.id("conversations") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const conv = await getConversationIfOwnedByUser(ctx, ctx.auth.user._id, args.conversationId);
    if (!conv) return false;
    const jobs = await ctx.db
      .query("agentQueue")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
      .collect();
    return jobs.some((j) => j.status === "pending" || j.status === "processing");
  },
});

const preferencesDoc = v.object({
  _id: v.id("userPreferences"),
  _creationTime: v.number(),
  userId: v.id("users"),
  showModelInfo: v.optional(v.boolean()),
  showToolDetails: v.optional(v.boolean()),
  updatedAt: v.number(),
});

const onboardingDoc = v.object({
  _id: v.id("userOnboarding"),
  _creationTime: v.number(),
  userId: v.id("users"),
  status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed")),
  currentStep: v.union(
    v.literal("preferredName"),
    v.literal("agentName"),
    v.literal("timezone"),
    v.literal("communicationStyle"),
    v.literal("focusArea"),
    v.literal("boundaries"),
  ),
  lastPromptedStep: v.optional(
    v.union(
      v.literal("preferredName"),
      v.literal("agentName"),
      v.literal("timezone"),
      v.literal("communicationStyle"),
      v.literal("focusArea"),
      v.literal("boundaries"),
    ),
  ),
  onboardingConversationId: v.optional(v.id("conversations")),
  answers: v.optional(
    v.object({
      preferredName: v.optional(v.string()),
      agentName: v.optional(v.string()),
      timezone: v.optional(v.string()),
      communicationStyle: v.optional(
        v.union(v.literal("concise"), v.literal("balanced"), v.literal("detailed")),
      ),
      focusArea: v.optional(v.string()),
      boundaries: v.optional(v.string()),
    }),
  ),
  completedAt: v.optional(v.number()),
  updatedAt: v.number(),
});

export const getConversationContext = serviceQuery({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.optional(v.id("messages")),
  },
  returns: v.union(
    v.object({
      conversation: conversationDoc,
      user: v.union(userDoc, v.null()),
      contact: v.union(contactDoc, v.null()),
      messages: v.array(messageDoc),
      skills: v.array(skillDoc),
      agent: v.union(agentDoc, v.null()),
      preferences: v.union(preferencesDoc, v.null()),
      onboarding: v.union(onboardingDoc, v.null()),
      noteContext: v.union(noteContextDoc, v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return null;

    const user = conversation.userId ? await ctx.db.get(conversation.userId) : null;
    const contact = conversation.contactId ? await ctx.db.get(conversation.contactId) : null;
    const ownerUserId = conversation.userId ?? contact?.userId;

    let noteContext = null;
    if (ownerUserId && args.messageId) {
      const triggeringMessage = await ctx.db.get(args.messageId);
      if (
        triggeringMessage &&
        triggeringMessage.conversationId === args.conversationId &&
        triggeringMessage.noteId
      ) {
        const messageNote = await ctx.db.get(triggeringMessage.noteId);
        if (messageNote && messageNote.userId === ownerUserId && !messageNote.isArchived) {
          noteContext = messageNote;
        }
      }
    }

    if (!noteContext && !args.messageId && ownerUserId) {
      noteContext = await ctx.db
        .query("notes")
        .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
        .filter((q) => q.eq(q.field("isArchived"), false))
        .collect()
        .then((noteList) => noteList.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null);
    }

    const messageLimit = noteContext ? 180 : 360;
    const messages = noteContext
      ? await ctx.db
          .query("messages")
          .withIndex("by_noteId", (q) => q.eq("noteId", noteContext._id))
          .filter((q) => q.eq(q.field("conversationId"), args.conversationId))
          .order("desc")
          .take(messageLimit)
          .then((msgList) => msgList.reverse())
      : await ctx.db
          .query("messages")
          .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
          .order("desc")
          .take(messageLimit)
          .then((msgList) => msgList.reverse());

    let skills = ownerUserId
      ? await ctx.db
          .query("skills")
          .withIndex("by_ownerUserId_enabled", (q) =>
            q.eq("ownerUserId", ownerUserId).eq("enabled", true),
          )
          .collect()
      : [];

    // Legacy compatibility: if no scoped skills are found, use unowned enabled skills.
    if (skills.length === 0) {
      skills = await ctx.db
        .query("skills")
        .withIndex("by_ownerUserId_enabled", (q) =>
          q.eq("ownerUserId", undefined).eq("enabled", true),
        )
        .collect();
    }

    const agent = conversation.agentId ? await ctx.db.get(conversation.agentId) : null;

    const preferences = ownerUserId
      ? await ctx.db
          .query("userPreferences")
          .withIndex("by_userId", (q) => q.eq("userId", ownerUserId))
          .unique()
      : null;

    const onboarding = ownerUserId
      ? await ctx.db
          .query("userOnboarding")
          .withIndex("by_userId", (q) => q.eq("userId", ownerUserId))
          .unique()
      : null;

    return {
      conversation,
      user,
      contact,
      messages,
      skills,
      agent,
      preferences,
      onboarding,
      noteContext: noteContext
        ? {
            noteId: noteContext._id,
            title: noteContext.title,
            contentPreview: noteContext.content.slice(0, 2_000),
          }
        : null,
    };
  },
});
