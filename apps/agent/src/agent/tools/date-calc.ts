import { tool } from "ai";
import { z } from "zod";

const UNITS = ["minutes", "hours", "days", "weeks", "months", "years"] as const;
type Unit = (typeof UNITS)[number];

function resolveDate(input: string): Date {
  if (input.toLowerCase() === "now") return new Date();
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: "${input}"`);
  return d;
}

function addToDate(date: Date, amount: number, unit: Unit): Date {
  const result = new Date(date);
  switch (unit) {
    case "minutes":
      result.setMinutes(result.getMinutes() + amount);
      break;
    case "hours":
      result.setHours(result.getHours() + amount);
      break;
    case "days":
      result.setDate(result.getDate() + amount);
      break;
    case "weeks":
      result.setDate(result.getDate() + amount * 7);
      break;
    case "months":
      result.setMonth(result.getMonth() + amount);
      break;
    case "years":
      result.setFullYear(result.getFullYear() + amount);
      break;
  }
  return result;
}

function diffDates(from: Date, to: Date): string {
  const ms = to.getTime() - from.getTime();
  const totalMinutes = Math.floor(Math.abs(ms) / 60_000);
  const totalHours = Math.floor(Math.abs(ms) / 3_600_000);
  const totalDays = Math.floor(Math.abs(ms) / 86_400_000);
  const sign = ms < 0 ? " (past)" : ms > 0 ? " (future)" : "";

  return [
    `Difference: ${totalDays} days, ${totalHours} hours, ${totalMinutes} minutes${sign}`,
    `Total milliseconds: ${ms}`,
    `Approximately ${(totalDays / 365.25).toFixed(2)} years or ${(totalDays / 30.44).toFixed(1)} months`,
  ].join("\n");
}

function dateInfo(date: Date, timezone?: string): string {
  const tz = timezone ?? "UTC";
  const formatted = date.toLocaleString("en-US", {
    timeZone: tz,
    dateStyle: "full",
    timeStyle: "long",
  });
  const dayOfWeek = date.toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });

  // ISO week number (based on UTC)
  const jan1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const daysSinceJan1 = Math.floor((date.getTime() - jan1.getTime()) / 86_400_000);
  const weekNumber = Math.ceil((daysSinceJan1 + jan1.getUTCDay() + 1) / 7);

  const quarter = Math.ceil((date.getUTCMonth() + 1) / 3);
  const year = date.getUTCFullYear();
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

  return [
    `Date: ${formatted}`,
    `Day of week: ${dayOfWeek}`,
    `Week number: ${weekNumber}`,
    `Quarter: Q${quarter}`,
    `Leap year: ${isLeapYear ? "yes" : "no"}`,
    `Unix timestamp: ${Math.floor(date.getTime() / 1000)}`,
    `ISO: ${date.toISOString()}`,
  ].join("\n");
}

const inputSchema = z.object({
  operation: z
    .enum(["add", "diff", "info"])
    .describe("add: add/subtract time, diff: difference between dates, info: date details"),
  date: z.string().optional().describe('Date string or "now" (for add, info)'),
  amount: z.number().optional().describe("Amount to add; negative to subtract (for add)"),
  unit: z.enum(UNITS).optional().describe("Time unit (for add)"),
  from: z.string().optional().describe('Start date string or "now" (for diff)'),
  to: z.string().optional().describe('End date string or "now" (for diff)'),
  timezone: z.string().optional().describe("IANA timezone for display (default UTC)"),
});

export const dateCalc = tool({
  description:
    'Perform date arithmetic: add/subtract time from a date, calculate the difference between two dates, or get date info (day of week, week number, quarter, leap year, unix timestamp). Use "now" for the current date/time.',
  inputSchema,
  execute: async (input) => {
    try {
      switch (input.operation) {
        case "add": {
          if (!input.date) return "Error: 'date' is required for add operation";
          if (input.amount === null || input.amount === undefined)
            return "Error: 'amount' is required for add operation";
          if (!input.unit) return "Error: 'unit' is required for add operation";
          const base = resolveDate(input.date);
          const result = addToDate(base, input.amount, input.unit);
          const tz = input.timezone ?? "UTC";
          const formatted = result.toLocaleString("en-US", {
            timeZone: tz,
            dateStyle: "full",
            timeStyle: "long",
          });
          return `${input.date} + ${input.amount} ${input.unit} = ${formatted}\nISO: ${result.toISOString()}`;
        }
        case "diff": {
          if (!input.from) return "Error: 'from' is required for diff operation";
          if (!input.to) return "Error: 'to' is required for diff operation";
          const from = resolveDate(input.from);
          const to = resolveDate(input.to);
          return diffDates(from, to);
        }
        case "info": {
          if (!input.date) return "Error: 'date' is required for info operation";
          const date = resolveDate(input.date);
          return dateInfo(date, input.timezone);
        }
      }
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
