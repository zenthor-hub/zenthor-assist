import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { env } from "@zenthor-assist/env/agent";
import { tool } from "ai";
import { z } from "zod";

import { getConvexClient } from "../../convex/client";

// Due date fields — defined as standalone schemas to preserve Zod type inference
const dueDateField = z
  .string()
  .optional()
  .describe("Due date in YYYY-MM-DD format. Use date_calc tool to resolve.");
const dueDateTimeField = z
  .string()
  .optional()
  .describe("Due datetime in ISO 8601 format (e.g. 2025-02-14T09:00:00). Overrides dueDate.");
const dueStringField = z
  .string()
  .optional()
  .describe('Human-readable due string (e.g. "every monday", "tomorrow at 3pm")');
const isRecurringField = z.boolean().optional().describe("Whether this is a recurring task");
const timezoneField = z
  .string()
  .optional()
  .describe("Timezone for the due date (e.g. America/Sao_Paulo)");

const durationSchema = z
  .object({
    amount: z.number().describe("Duration amount (must be at least 1)"),
    unit: z.enum(["minute", "day"]).describe("Duration unit"),
  })
  .optional()
  .describe("Estimated task duration");

const createInputSchema = z.object({
  title: z.string().describe("Task title"),
  description: z.string().optional().describe("Optional task details"),
  priority: z
    .number()
    .optional()
    .describe("Priority: 1=normal, 2=medium, 3=high, 4=urgent"),
  dueDate: dueDateField,
  dueDateTime: dueDateTimeField,
  dueString: dueStringField,
  isRecurring: isRecurringField,
  timezone: timezoneField,
  duration: durationSchema,
  labels: z.array(z.string()).optional().describe("Labels for categorization"),
  projectName: z.string().optional().describe("Project name (auto-created if it doesn't exist)"),
  parentTaskId: z.string().optional().describe("Parent task ID for subtasks"),
});

const listInputSchema = z.object({
  status: z.enum(["todo", "in_progress", "done"]).optional().describe("Filter by status"),
  priority: z.number().optional().describe("Filter by priority (1=normal, 4=urgent)"),
  labels: z.array(z.string()).optional().describe("Filter by labels"),
  limit: z.number().optional().describe("Max tasks to return (default 50, max 100)"),
});

const updateInputSchema = z.object({
  taskId: z.string().describe("Task ID to update"),
  title: z.string().optional().describe("New title"),
  description: z.string().optional().describe("New description"),
  status: z.enum(["todo", "in_progress", "done"]).optional().describe("New status"),
  priority: z.number().optional().describe("New priority (1=normal, 4=urgent)"),
  dueDate: dueDateField,
  dueDateTime: dueDateTimeField,
  dueString: dueStringField,
  isRecurring: isRecurringField,
  timezone: timezoneField,
  duration: durationSchema,
  labels: z.array(z.string()).optional().describe("New labels"),
});

const completeInputSchema = z.object({
  taskId: z.string().describe("Task ID to complete"),
});

const deleteInputSchema = z.object({
  taskId: z.string().describe("Task ID to delete"),
});

function unboundMessage(toolName: string): string {
  return `Tool '${toolName}' is not bound to a conversation. Retry from a normal chat context.`;
}

function formatError(action: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Failed to ${action}: ${message}`;
}

interface DueObject {
  date: string;
  datetime?: string;
  string?: string;
  isRecurring?: boolean;
  timezone?: string;
}

/**
 * Build a due object from agent input fields.
 * Returns undefined if no due fields are provided.
 */
function buildDueObject(input: {
  dueDate?: string;
  dueDateTime?: string;
  dueString?: string;
  isRecurring?: boolean;
  timezone?: string;
}): DueObject | undefined {
  const { dueDate, dueDateTime, dueString, isRecurring, timezone } = input;
  if (!dueDate && !dueDateTime) return undefined;

  // Extract date portion from datetime if dueDate not explicitly provided
  const date = dueDate ?? dueDateTime!.slice(0, 10);

  return {
    date,
    datetime: dueDateTime,
    string: dueString,
    isRecurring,
    timezone,
  };
}

const PRIORITY_LABELS: Record<number, string> = {
  1: "normal",
  2: "medium",
  3: "high",
  4: "urgent",
};

function formatTaskList(
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority?: number;
    due?: DueObject;
    dueAt?: number;
    labels?: string[];
    duration?: { amount: number; unit: string };
  }>,
): string {
  if (tasks.length === 0) return "No tasks found.";

  return tasks
    .map((task, index) => {
      const parts = [`${index + 1}. ${task.title}`];
      if (task.priority) parts.push(PRIORITY_LABELS[task.priority] ?? `p${task.priority}`);
      if (task.status !== "todo") parts.push(task.status);
      if (task.due) {
        const dueText = task.due.datetime ?? task.due.date;
        parts.push(`due: ${dueText}`);
        if (task.due.isRecurring && task.due.string) {
          parts.push(`(${task.due.string})`);
        }
      }
      if (task.duration)
        parts.push(`${task.duration.amount}${task.duration.unit === "minute" ? "min" : "d"}`);
      if (task.labels && task.labels.length > 0) parts.push(`[${task.labels.join(", ")}]`);
      parts.push(`id: ${task.id}`);
      return parts.join(" | ");
    })
    .join("\n");
}

export function createTaskTools(conversationId: Id<"conversations">) {
  const create = tool({
    description:
      "Create a task for the user. Use date_calc first to resolve natural-language dates to YYYY-MM-DD format.",
    inputSchema: createInputSchema,
    execute: async ({
      title,
      description,
      priority,
      dueDate,
      dueDateTime,
      dueString,
      isRecurring,
      timezone,
      duration,
      labels,
      projectName,
      parentTaskId,
    }) => {
      try {
        const client = getConvexClient();
        const due = buildDueObject({ dueDate, dueDateTime, dueString, isRecurring, timezone });

        const task = await client.mutation(api.tasks.createForConversation, {
          serviceKey: env.AGENT_SECRET,
          conversationId,
          title,
          description,
          priority,
          due,
          duration,
          labels,
          projectName,
          parentTaskId: parentTaskId as Id<"tasks"> | undefined,
        });

        const dueText = task.due ? ` due ${task.due.datetime ?? task.due.date}` : "";
        return `Created task '${task.title}' (id: ${task.id})${dueText}.`;
      } catch (error) {
        return formatError("create task", error);
      }
    },
  });

  const list = tool({
    description: "List the user's tasks. Can filter by status, priority, or labels.",
    inputSchema: listInputSchema,
    execute: async ({ status, priority, labels, limit }) => {
      try {
        const client = getConvexClient();
        const tasks = await client.query(api.tasks.listForConversation, {
          serviceKey: env.AGENT_SECRET,
          conversationId,
          status,
          priority,
          labels,
          limit,
        });

        return formatTaskList(tasks);
      } catch (error) {
        return formatError("list tasks", error);
      }
    },
  });

  const update = tool({
    description:
      "Update a task's title, description, status, priority, due date, duration, or labels.",
    inputSchema: updateInputSchema,
    execute: async ({
      taskId,
      title,
      description,
      status,
      priority,
      dueDate,
      dueDateTime,
      dueString,
      isRecurring,
      timezone,
      duration,
      labels,
    }) => {
      try {
        const client = getConvexClient();
        const due = buildDueObject({ dueDate, dueDateTime, dueString, isRecurring, timezone });

        const task = await client.mutation(api.tasks.updateForConversation, {
          serviceKey: env.AGENT_SECRET,
          conversationId,
          taskId: taskId as Id<"tasks">,
          title,
          description,
          status,
          priority,
          due,
          duration,
          labels,
        });

        return `Updated task '${task.title}' (id: ${task.id}).`;
      } catch (error) {
        return formatError("update task", error);
      }
    },
  });

  const complete = tool({
    description: "Mark a task as done.",
    inputSchema: completeInputSchema,
    execute: async ({ taskId }) => {
      try {
        const client = getConvexClient();
        const completed = await client.mutation(api.tasks.completeForConversation, {
          serviceKey: env.AGENT_SECRET,
          conversationId,
          taskId: taskId as Id<"tasks">,
        });

        return completed
          ? `Marked task ${taskId} as done.`
          : "Could not complete task. Check the task ID is valid.";
      } catch (error) {
        return formatError("complete task", error);
      }
    },
  });

  const del = tool({
    description: "Delete a task permanently.",
    inputSchema: deleteInputSchema,
    execute: async ({ taskId }) => {
      try {
        const client = getConvexClient();
        const deleted = await client.mutation(api.tasks.removeForConversation, {
          serviceKey: env.AGENT_SECRET,
          conversationId,
          taskId: taskId as Id<"tasks">,
        });

        return deleted
          ? `Deleted task ${taskId}.`
          : "Could not delete task. Check the task ID is valid.";
      } catch (error) {
        return formatError("delete task", error);
      }
    },
  });

  return {
    task_create: create,
    task_list: list,
    task_update: update,
    task_complete: complete,
    task_delete: del,
  };
}

export const taskCreate = tool({
  description:
    "Create a task for the user. This static tool is replaced per conversation in the agent loop.",
  inputSchema: createInputSchema,
  execute: async () => unboundMessage("task_create"),
});

export const taskList = tool({
  description:
    "List the user's tasks. This static tool is replaced per conversation in the agent loop.",
  inputSchema: listInputSchema,
  execute: async () => unboundMessage("task_list"),
});

export const taskUpdate = tool({
  description: "Update a task. This static tool is replaced per conversation in the agent loop.",
  inputSchema: updateInputSchema,
  execute: async () => unboundMessage("task_update"),
});

export const taskComplete = tool({
  description:
    "Mark a task as done. This static tool is replaced per conversation in the agent loop.",
  inputSchema: completeInputSchema,
  execute: async () => unboundMessage("task_complete"),
});

export const taskDelete = tool({
  description: "Delete a task. This static tool is replaced per conversation in the agent loop.",
  inputSchema: deleteInputSchema,
  execute: async () => unboundMessage("task_delete"),
});
