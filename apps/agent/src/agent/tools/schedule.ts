import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { tool } from "ai";
import { z } from "zod";

import { getConvexClient } from "../../convex/client";

export const scheduleTask = tool({
  description:
    "Schedule a recurring task or reminder. The task will automatically create messages in the conversation at the specified interval.",
  inputSchema: z.object({
    name: z.string().describe("Name of the scheduled task"),
    description: z.string().optional().describe("What this task should do"),
    intervalMinutes: z.number().describe("How often to run, in minutes"),
    payload: z.string().describe("The message or instruction to execute"),
  }),
  execute: async ({ name, description, intervalMinutes, payload }) => {
    const client = getConvexClient();
    await client.mutation(api.scheduledTasks.create, {
      name,
      description,
      intervalMs: intervalMinutes * 60 * 1000,
      payload,
      enabled: true,
    });
    return `Scheduled task "${name}" created. It will run every ${intervalMinutes} minutes.`;
  },
});
