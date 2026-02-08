import { v } from "convex/values";

import { adminMutation, adminQuery } from "./auth";

const skillConfigValidator = v.optional(
  v.object({
    systemPrompt: v.optional(v.string()),
    toolPolicy: v.optional(
      v.object({
        allow: v.optional(v.array(v.string())),
        deny: v.optional(v.array(v.string())),
      }),
    ),
  }),
);

const skillDoc = v.object({
  _id: v.id("skills"),
  _creationTime: v.number(),
  ownerUserId: v.optional(v.id("users")),
  name: v.string(),
  description: v.string(),
  enabled: v.boolean(),
  config: skillConfigValidator,
});

const recommendedSkills: Array<{
  name: string;
  description: string;
  enabled: boolean;
  config?: {
    systemPrompt?: string;
    toolPolicy?: {
      allow?: string[];
      deny?: string[];
    };
  };
}> = [
  {
    name: "Summarize Links and Documents",
    description:
      "Summarizes URLs and long text into concise outputs with key points, decisions, and action items.",
    enabled: true,
    config: {
      systemPrompt:
        "When asked to summarize, return: Executive Summary, Key Points, Decisions, Risks, and Action Items. If source is long, summarize first and offer a deeper follow-up.",
      toolPolicy: {
        allow: ["browse_url", "web_search", "google_search", "memory_store", "memory_search"],
      },
    },
  },
  {
    name: "Professional Note Structurer",
    description: "Transforms rough notes into clean summaries, decisions, and next actions.",
    enabled: true,
    config: {
      systemPrompt:
        "When given notes, return: Summary, Key Decisions, Action Items (owner + due date if available), and Open Questions.",
      toolPolicy: {
        allow: ["memory_store", "memory_search", "date_calc", "get_current_time"],
      },
    },
  },
  {
    name: "Vault Notes Writer (Obsidian/Notion Style)",
    description:
      "Writes evergreen notes in a knowledge-vault style with links, tags, and reusable structure.",
    enabled: true,
    config: {
      systemPrompt:
        "Create structured markdown notes with: Title, Context, Details, Linked Concepts, and Next Actions. Use stable naming and avoid duplicates by checking memory first.",
      toolPolicy: {
        allow: ["memory_search", "memory_store", "date_calc", "get_current_time"],
      },
    },
  },
  {
    name: "Weekly Planner",
    description: "Builds weekly plans from priorities and schedules practical follow-up reminders.",
    enabled: true,
    config: {
      systemPrompt:
        "Prioritize by impact and urgency, then propose a realistic weekly plan with daily checkpoints and explicit tradeoffs.",
      toolPolicy: {
        allow: ["schedule_task", "date_calc", "get_current_time", "memory_search", "memory_store"],
      },
    },
  },
  {
    name: "Reminders and Follow-ups",
    description:
      "Converts commitments into reminder plans with clear due dates, review cycles, and recurring follow-ups.",
    enabled: true,
    config: {
      systemPrompt:
        "When commitments are mentioned, propose reminder entries with due date/time, recurrence, and escalation notes. Ask for missing dates only when necessary.",
      toolPolicy: {
        allow: ["schedule_task", "date_calc", "get_current_time", "memory_search", "memory_store"],
      },
    },
  },
  {
    name: "Project Board Planner",
    description:
      "Organizes work in board-like stages (Backlog, Next, Doing, Blocked, Done) for execution tracking.",
    enabled: true,
    config: {
      systemPrompt:
        "Map work into board stages and keep cards small, actionable, and outcome-based. Highlight blockers and next-owner transitions.",
      toolPolicy: {
        allow: ["memory_search", "memory_store", "schedule_task", "date_calc", "get_current_time"],
      },
    },
  },
  {
    name: "Calendar and Inbox Assistant",
    description:
      "Prepares daily agendas and meeting follow-ups by synthesizing commitments and communication tasks.",
    enabled: true,
    config: {
      systemPrompt:
        "Produce a daily agenda with time blocks, preparation checklist, and follow-up message drafts. Emphasize realistic pacing and conflict resolution.",
      toolPolicy: {
        allow: ["date_calc", "get_current_time", "schedule_task", "memory_search", "memory_store"],
      },
    },
  },
  {
    name: "Financial Planning Copilot",
    description:
      "Helps with budgeting and cashflow planning using transparent assumptions and simple math.",
    enabled: true,
    config: {
      systemPrompt:
        "For financial guidance, always show assumptions, formulas, and a concise risk note. Do not present estimates as certainties.",
      toolPolicy: {
        allow: [
          "calculate",
          "date_calc",
          "browse_url",
          "web_search",
          "google_search",
          "memory_search",
          "memory_store",
        ],
      },
    },
  },
  {
    name: "Meeting Prep and Follow-up",
    description:
      "Creates agendas before meetings and turns outcomes into concrete follow-up steps.",
    enabled: true,
    config: {
      systemPrompt:
        "Prepare concise meeting agendas and convert meeting outcomes into owners, deadlines, and follow-ups.",
      toolPolicy: {
        allow: [
          "browse_url",
          "web_search",
          "google_search",
          "memory_search",
          "memory_store",
          "schedule_task",
        ],
      },
    },
  },
  {
    name: "Session History Analyst",
    description:
      "Finds prior decisions and commitments from conversation memory, then summarizes what changed.",
    enabled: true,
    config: {
      systemPrompt:
        "When asked about past context, retrieve relevant memory, compare old vs current state, and produce a concise 'Then vs Now' summary.",
      toolPolicy: {
        allow: ["memory_search", "memory_store", "date_calc", "get_current_time"],
      },
    },
  },
];

export const list = adminQuery({
  args: {},
  returns: v.array(skillDoc),
  handler: async (ctx) => {
    const owned = await ctx.db
      .query("skills")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", ctx.auth.user._id))
      .collect();
    if (owned.length > 0) return owned;

    // Legacy compatibility: show unowned skills until they are claimed/migrated.
    return await ctx.db
      .query("skills")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", undefined))
      .collect();
  },
});

export const getByName = adminQuery({
  args: { name: v.string() },
  returns: v.union(skillDoc, v.null()),
  handler: async (ctx, args) => {
    const skills = await ctx.db
      .query("skills")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .collect();
    const owned = skills.find((skill) => skill.ownerUserId === ctx.auth.user._id);
    if (owned) return owned;
    return skills.find((skill) => skill.ownerUserId === undefined) ?? null;
  },
});

export const create = adminMutation({
  args: {
    name: v.string(),
    description: v.string(),
    enabled: v.boolean(),
    config: skillConfigValidator,
  },
  returns: v.id("skills"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("skills", {
      ...args,
      ownerUserId: ctx.auth.user._id,
    });
  },
});

export const toggle = adminMutation({
  args: { id: v.id("skills") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.id);
    if (!skill) return null;
    if (skill.ownerUserId && skill.ownerUserId !== ctx.auth.user._id) return null;
    await ctx.db.patch(args.id, {
      enabled: !skill.enabled,
      ...(skill.ownerUserId === undefined ? { ownerUserId: ctx.auth.user._id } : {}),
    });
    return null;
  },
});

export const update = adminMutation({
  args: {
    id: v.id("skills"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    config: skillConfigValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.id);
    if (!skill) return null;
    if (skill.ownerUserId && skill.ownerUserId !== ctx.auth.user._id) return null;
    const { id, ...fields } = args;
    await ctx.db.patch(id, {
      ...fields,
      ...(skill.ownerUserId === undefined ? { ownerUserId: ctx.auth.user._id } : {}),
    });
    return null;
  },
});

export const remove = adminMutation({
  args: { id: v.id("skills") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.id);
    if (!skill) return null;
    if (skill.ownerUserId && skill.ownerUserId !== ctx.auth.user._id) return null;
    await ctx.db.delete(args.id);
    return null;
  },
});

export const seedRecommended = adminMutation({
  args: {},
  returns: v.object({
    created: v.number(),
    existing: v.number(),
    total: v.number(),
  }),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("skills")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", ctx.auth.user._id))
      .collect();
    const existingNames = new Set(existing.map((skill) => skill.name.toLowerCase()));

    let created = 0;
    let alreadyExists = 0;

    for (const skill of recommendedSkills) {
      if (existingNames.has(skill.name.toLowerCase())) {
        alreadyExists += 1;
        continue;
      }
      await ctx.db.insert("skills", {
        ownerUserId: ctx.auth.user._id,
        ...skill,
      });
      created += 1;
    }

    return { created, existing: alreadyExists, total: recommendedSkills.length };
  },
});

export const claimLegacy = adminMutation({
  args: {},
  returns: v.object({ adopted: v.number() }),
  handler: async (ctx) => {
    const legacy = await ctx.db
      .query("skills")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", undefined))
      .collect();

    for (const skill of legacy) {
      await ctx.db.patch(skill._id, { ownerUserId: ctx.auth.user._id });
    }

    return { adopted: legacy.length };
  },
});
