import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Cleanup completed agentQueue jobs older than 7 days — runs daily at 3am UTC
crons.daily(
  "cleanup old jobs",
  { hourUTC: 3, minuteUTC: 0 },
  internal.scheduledTasks.cleanupOldJobs,
);

// Process due scheduled tasks — runs every 5 minutes
crons.interval("process scheduled tasks", { minutes: 5 }, internal.scheduledTasks.processDueTasks);

export default crons;
