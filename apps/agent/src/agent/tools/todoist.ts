import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { env } from "@zenthor-assist/env/agent";
import { tool } from "ai";
import { z } from "zod";

import { getConvexClient } from "../../convex/client";

const captureTaskInputSchema = z.object({
  content: z.string().describe("Task title/content"),
  description: z.string().optional().describe("Optional task details"),
  projectId: z.string().optional().describe("Todoist project ID"),
  sectionId: z.string().optional().describe("Todoist section ID"),
  labels: z.array(z.string()).optional().describe("Todoist labels"),
  priority: z.number().min(1).max(4).optional().describe("Todoist priority (1-4)"),
  dueString: z.string().optional().describe("Natural language due date, e.g. 'tomorrow 9am'"),
  dueDateTime: z.string().optional().describe("RFC3339 due datetime, e.g. 2026-02-09T09:00:00Z"),
});

const listTasksInputSchema = z.object({
  filter: z
    .string()
    .optional()
    .describe("Todoist filter expression, e.g. 'today & !p4' or 'overdue'"),
  limit: z.number().min(1).max(50).optional().describe("Max tasks to return (default 20)"),
});

const completeTaskInputSchema = z.object({
  taskId: z.string().describe("Todoist task ID"),
});

const rescheduleTaskInputSchema = z
  .object({
    taskId: z.string().describe("Todoist task ID"),
    dueString: z.string().optional().describe("Natural language due date, e.g. 'next monday'"),
    dueDateTime: z.string().optional().describe("RFC3339 due datetime, e.g. 2026-02-10T14:00:00Z"),
  })
  .refine((value) => Boolean(value.dueString || value.dueDateTime), {
    message: "Either dueString or dueDateTime is required.",
  });

function renderDue(task: {
  dueString?: string;
  dueDate?: string;
  dueDateTime?: string;
}): string | null {
  if (task.dueString) return task.dueString;
  if (task.dueDateTime) return task.dueDateTime;
  if (task.dueDate) return task.dueDate;
  return null;
}

function formatTaskList(
  tasks: Array<{
    id: string;
    content: string;
    priority?: number;
    dueString?: string;
    dueDate?: string;
    dueDateTime?: string;
  }>,
): string {
  return tasks
    .map((task, index) => {
      const due = renderDue(task);
      const dueText = due ? ` | due: ${due}` : "";
      const priorityText = task.priority ? ` | p${task.priority}` : "";
      return `${index + 1}. ${task.content}${priorityText}${dueText} | id: ${task.id}`;
    })
    .join("\n");
}

function unboundConversationMessage(toolName: string): string {
  return `Tool '${toolName}' is not bound to a conversation. Retry from a normal chat context.`;
}

function formatToolError(action: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Failed to ${action} in Todoist: ${message}`;
}

export function createTodoistTools(conversationId: Id<"conversations">) {
  const capture = tool({
    description:
      "Create a Todoist task for the user connected to this conversation. Use this for inbox capture, follow-ups, and action items.",
    inputSchema: captureTaskInputSchema,
    execute: async ({
      content,
      description,
      projectId,
      sectionId,
      labels,
      priority,
      dueString,
      dueDateTime,
    }) => {
      try {
        const client = getConvexClient();
        const task = await client.mutation(api.todoist.createTaskForConversation, {
          serviceKey: env.AGENT_SECRET,
          conversationId,
          content,
          description,
          projectId,
          sectionId,
          labels,
          priority,
          dueString,
          dueDateTime,
        });

        if (!task) {
          return "Todoist is not connected for this user. Ask the user to connect Todoist in Settings.";
        }

        const due = renderDue(task);
        return due
          ? `Created task '${task.content}' (id: ${task.id}) due ${due}.`
          : `Created task '${task.content}' (id: ${task.id}).`;
      } catch (error) {
        return formatToolError("create task", error);
      }
    },
  });

  const list = tool({
    description:
      "List Todoist tasks for the user connected to this conversation. Supports Todoist filter expressions.",
    inputSchema: listTasksInputSchema,
    execute: async ({ filter, limit }) => {
      try {
        const client = getConvexClient();
        const tasks = await client.query(api.todoist.listTasksForConversation, {
          serviceKey: env.AGENT_SECRET,
          conversationId,
          filter,
          limit,
        });

        if (!tasks) {
          return "Todoist is not connected for this user. Ask the user to connect Todoist in Settings.";
        }
        if (tasks.length === 0) {
          return "No matching Todoist tasks found.";
        }

        return formatTaskList(tasks);
      } catch (error) {
        return formatToolError("list tasks", error);
      }
    },
  });

  const complete = tool({
    description: "Mark a Todoist task as completed.",
    inputSchema: completeTaskInputSchema,
    execute: async ({ taskId }) => {
      try {
        const client = getConvexClient();
        const completed = await client.mutation(api.todoist.completeTaskForConversation, {
          serviceKey: env.AGENT_SECRET,
          conversationId,
          taskId,
        });

        return completed
          ? `Marked Todoist task ${taskId} as completed.`
          : "Could not complete Todoist task. Ensure Todoist is connected and the task id is valid.";
      } catch (error) {
        return formatToolError("complete task", error);
      }
    },
  });

  const reschedule = tool({
    description: "Reschedule a Todoist task using natural language or an RFC3339 datetime.",
    inputSchema: rescheduleTaskInputSchema,
    execute: async ({ taskId, dueString, dueDateTime }) => {
      try {
        const client = getConvexClient();
        const task = await client.mutation(api.todoist.rescheduleTaskForConversation, {
          serviceKey: env.AGENT_SECRET,
          conversationId,
          taskId,
          dueString,
          dueDateTime,
        });

        if (!task) {
          return "Could not reschedule Todoist task. Ensure Todoist is connected and the task id is valid.";
        }

        const due = renderDue(task);
        return due
          ? `Rescheduled task '${task.content}' (id: ${task.id}) to ${due}.`
          : `Task '${task.content}' (id: ${task.id}) was updated, but no due date is now set.`;
      } catch (error) {
        return formatToolError("reschedule task", error);
      }
    },
  });

  return {
    todoist_capture_task: capture,
    todoist_list_tasks: list,
    todoist_complete_task: complete,
    todoist_reschedule_task: reschedule,
  };
}

export const todoistCaptureTask = tool({
  description:
    "Create a Todoist task for the connected user. This static tool is replaced per conversation in the agent loop.",
  inputSchema: captureTaskInputSchema,
  execute: async () => unboundConversationMessage("todoist_capture_task"),
});

export const todoistListTasks = tool({
  description:
    "List Todoist tasks for the connected user. This static tool is replaced per conversation in the agent loop.",
  inputSchema: listTasksInputSchema,
  execute: async () => unboundConversationMessage("todoist_list_tasks"),
});

export const todoistCompleteTask = tool({
  description:
    "Mark Todoist tasks complete. This static tool is replaced per conversation in the agent loop.",
  inputSchema: completeTaskInputSchema,
  execute: async () => unboundConversationMessage("todoist_complete_task"),
});

export const todoistRescheduleTask = tool({
  description:
    "Reschedule Todoist tasks. This static tool is replaced per conversation in the agent loop.",
  inputSchema: rescheduleTaskInputSchema,
  execute: async () => unboundConversationMessage("todoist_reschedule_task"),
});
