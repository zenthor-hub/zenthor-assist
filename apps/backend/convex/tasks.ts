import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authMutation, authQuery, serviceMutation, serviceQuery } from "./auth";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

async function getConversationOwnerUserId(
  ctx: DbCtx,
  conversationId: Id<"conversations">,
): Promise<Id<"users"> | null> {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) return null;
  if (conversation.userId) return conversation.userId;
  if (!conversation.contactId) return null;

  const contact = await ctx.db.get(conversation.contactId);
  return contact?.userId ?? null;
}

// ── Due date helpers ──

interface DueObject {
  date: string;
  datetime?: string;
  string?: string;
  isRecurring?: boolean;
  timezone?: string;
  lang?: string;
}

/**
 * Compute a denormalized epoch ms from a due object for indexing.
 * Uses datetime if available, otherwise parses the date string at midnight UTC.
 */
function computeDueAt(due?: DueObject): number | undefined {
  if (!due) return undefined;
  if (due.datetime) return new Date(due.datetime).getTime();
  return new Date(`${due.date}T00:00:00Z`).getTime();
}

const dueValidator = v.optional(
  v.object({
    date: v.string(),
    datetime: v.optional(v.string()),
    string: v.optional(v.string()),
    isRecurring: v.optional(v.boolean()),
    timezone: v.optional(v.string()),
    lang: v.optional(v.string()),
  }),
);

const durationValidator = v.optional(
  v.object({
    amount: v.number(),
    unit: v.union(v.literal("minute"), v.literal("day")),
  }),
);

function formatTaskSummary(task: {
  _id: Id<"tasks">;
  title: string;
  description?: string;
  status: string;
  priority?: number;
  due?: DueObject;
  dueAt?: number;
  completedAt?: number;
  labels?: string[];
  duration?: { amount: number; unit: "minute" | "day" };
  order?: number;
}) {
  return {
    id: task._id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    due: task.due,
    dueAt: task.dueAt,
    completedAt: task.completedAt,
    labels: task.labels,
    duration: task.duration,
    order: task.order,
  };
}

// ── Auth functions (web-facing) ──

export const list = authQuery({
  args: {
    status: v.optional(v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done"))),
    projectId: v.optional(v.id("taskProjects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.auth.user._id;
    const limit = args.limit ?? 50;

    let query;
    if (args.status) {
      query = ctx.db
        .query("tasks")
        .withIndex("by_userId_status", (q) => q.eq("userId", userId).eq("status", args.status!));
    } else if (args.projectId) {
      query = ctx.db
        .query("tasks")
        .withIndex("by_userId_projectId", (q) =>
          q.eq("userId", userId).eq("projectId", args.projectId!),
        );
    } else {
      query = ctx.db.query("tasks").withIndex("by_userId_dueAt", (q) => q.eq("userId", userId));
    }

    const tasks = await query.take(limit);
    return tasks;
  },
});

export const get = authQuery({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== ctx.auth.user._id) return null;
    return task;
  },
});

export const getSubtasks = authQuery({
  args: { parentId: v.id("tasks") },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentId);
    if (!parent || parent.userId !== ctx.auth.user._id) return [];
    return await ctx.db
      .query("tasks")
      .withIndex("by_parentId", (q) => q.eq("parentId", args.parentId))
      .collect();
  },
});

export const create = authMutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    status: v.optional(v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done"))),
    priority: v.optional(v.number()),
    due: dueValidator,
    duration: durationValidator,
    labels: v.optional(v.array(v.string())),
    projectId: v.optional(v.id("taskProjects")),
    sectionId: v.optional(v.id("taskSections")),
    parentId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("tasks", {
      userId: ctx.auth.user._id,
      title: args.title,
      description: args.description,
      status: args.status ?? "todo",
      priority: args.priority,
      due: args.due,
      dueAt: computeDueAt(args.due),
      duration: args.duration,
      labels: args.labels,
      projectId: args.projectId,
      sectionId: args.sectionId,
      parentId: args.parentId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = authMutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done"))),
    priority: v.optional(v.number()),
    due: dueValidator,
    duration: durationValidator,
    labels: v.optional(v.array(v.string())),
    projectId: v.optional(v.id("taskProjects")),
    sectionId: v.optional(v.id("taskSections")),
    parentId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== ctx.auth.user._id) {
      throw new ConvexError("Task not found");
    }

    const { id, ...updates } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patch[key] = value;
    }

    // Recompute denormalized dueAt when due changes
    if (updates.due !== undefined) {
      patch.dueAt = computeDueAt(updates.due);
    }

    if (updates.status === "done" && task.status !== "done") {
      patch.completedAt = Date.now();
    } else if (updates.status && updates.status !== "done") {
      patch.completedAt = undefined;
    }

    await ctx.db.patch(id, patch);
  },
});

export const toggleComplete = authMutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== ctx.auth.user._id) {
      throw new ConvexError("Task not found");
    }

    const now = Date.now();
    if (task.status === "done") {
      await ctx.db.patch(args.id, {
        status: "todo",
        completedAt: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(args.id, {
        status: "done",
        completedAt: now,
        updatedAt: now,
      });
    }
  },
});

export const remove = authMutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== ctx.auth.user._id) {
      throw new ConvexError("Task not found");
    }

    // Delete subtasks
    const subtasks = await ctx.db
      .query("tasks")
      .withIndex("by_parentId", (q) => q.eq("parentId", args.id))
      .collect();
    for (const subtask of subtasks) {
      await ctx.db.delete(subtask._id);
    }

    await ctx.db.delete(args.id);
  },
});

// ── Service functions (agent-facing) ──

export const createForConversation = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.optional(v.number()),
    due: dueValidator,
    duration: durationValidator,
    labels: v.optional(v.array(v.string())),
    projectName: v.optional(v.string()),
    parentTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const userId = await getConversationOwnerUserId(ctx, args.conversationId);
    if (!userId) throw new ConvexError("Could not resolve user for conversation");

    let projectId: Id<"taskProjects"> | undefined;
    if (args.projectName) {
      const existing = await ctx.db
        .query("taskProjects")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .filter((q) => q.eq(q.field("name"), args.projectName!))
        .first();

      if (existing) {
        projectId = existing._id;
      } else {
        const now = Date.now();
        projectId = await ctx.db.insert("taskProjects", {
          userId,
          name: args.projectName,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const now = Date.now();
    const taskId = await ctx.db.insert("tasks", {
      userId,
      conversationId: args.conversationId,
      title: args.title,
      description: args.description,
      status: "todo",
      priority: args.priority,
      due: args.due,
      dueAt: computeDueAt(args.due),
      duration: args.duration,
      labels: args.labels,
      projectId,
      parentId: args.parentTaskId,
      createdAt: now,
      updatedAt: now,
    });

    const task = await ctx.db.get(taskId);
    return formatTaskSummary(task!);
  },
});

export const listForConversation = serviceQuery({
  args: {
    conversationId: v.id("conversations"),
    status: v.optional(v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done"))),
    priority: v.optional(v.number()),
    labels: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getConversationOwnerUserId(ctx, args.conversationId);
    if (!userId) return [];

    const limit = args.limit ?? 50;

    let tasks;
    if (args.status) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_userId_status", (q) => q.eq("userId", userId).eq("status", args.status!))
        .take(limit);
    } else {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_userId_dueAt", (q) => q.eq("userId", userId))
        .take(limit);
    }

    // Apply optional filters
    let filtered = tasks;
    if (args.priority !== undefined) {
      filtered = filtered.filter((t) => t.priority === args.priority);
    }
    if (args.labels && args.labels.length > 0) {
      filtered = filtered.filter(
        (t) => t.labels && args.labels!.some((l) => t.labels!.includes(l)),
      );
    }

    return filtered.map(formatTaskSummary);
  },
});

export const updateForConversation = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done"))),
    priority: v.optional(v.number()),
    due: dueValidator,
    duration: durationValidator,
    labels: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getConversationOwnerUserId(ctx, args.conversationId);
    if (!userId) throw new ConvexError("Could not resolve user for conversation");

    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== userId) {
      throw new ConvexError("Task not found");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.status !== undefined) {
      patch.status = args.status;
      if (args.status === "done" && task.status !== "done") {
        patch.completedAt = Date.now();
      } else if (args.status !== "done") {
        patch.completedAt = undefined;
      }
    }
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.due !== undefined) {
      patch.due = args.due;
      patch.dueAt = computeDueAt(args.due);
    }
    if (args.duration !== undefined) patch.duration = args.duration;
    if (args.labels !== undefined) patch.labels = args.labels;

    await ctx.db.patch(args.taskId, patch);

    const updated = await ctx.db.get(args.taskId);
    return formatTaskSummary(updated!);
  },
});

export const completeForConversation = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const userId = await getConversationOwnerUserId(ctx, args.conversationId);
    if (!userId) return false;

    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== userId) return false;

    const now = Date.now();
    await ctx.db.patch(args.taskId, {
      status: "done",
      completedAt: now,
      updatedAt: now,
    });
    return true;
  },
});

export const removeForConversation = serviceMutation({
  args: {
    conversationId: v.id("conversations"),
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const userId = await getConversationOwnerUserId(ctx, args.conversationId);
    if (!userId) return false;

    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== userId) return false;

    // Delete subtasks
    const subtasks = await ctx.db
      .query("tasks")
      .withIndex("by_parentId", (q) => q.eq("parentId", args.taskId))
      .collect();
    for (const subtask of subtasks) {
      await ctx.db.delete(subtask._id);
    }

    await ctx.db.delete(args.taskId);
    return true;
  },
});
