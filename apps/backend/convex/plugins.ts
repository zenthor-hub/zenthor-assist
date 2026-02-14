import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { adminMutation, adminQuery, serviceMutation, serviceQuery } from "./auth";

const channelValidator = v.union(v.literal("web"), v.literal("whatsapp"), v.literal("telegram"));

const diagnosticStatusValidator = v.union(
  v.literal("activated"),
  v.literal("conflict"),
  v.literal("invalid"),
);

const pluginDefinitionDoc = v.object({
  _id: v.id("pluginDefinitions"),
  _creationTime: v.number(),
  name: v.string(),
  version: v.string(),
  source: v.string(),
  status: v.union(v.literal("active"), v.literal("inactive")),
  manifest: v.any(),
  checksum: v.optional(v.string()),
  diagnosticStatus: v.optional(diagnosticStatusValidator),
  diagnosticMessages: v.optional(v.array(v.string())),
  lastDiagnosticAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const pluginInstallDoc = v.object({
  _id: v.id("pluginInstalls"),
  _creationTime: v.number(),
  workspaceScope: v.string(),
  agentId: v.optional(v.id("agents")),
  channel: v.optional(channelValidator),
  pluginName: v.string(),
  enabled: v.boolean(),
  config: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const pluginPolicyDoc = v.object({
  _id: v.id("pluginPolicies"),
  _creationTime: v.number(),
  workspaceScope: v.string(),
  agentId: v.optional(v.id("agents")),
  channel: v.optional(channelValidator),
  allow: v.optional(v.array(v.string())),
  deny: v.optional(v.array(v.string())),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function getScopedInstalls(
  ctx: QueryCtx,
  workspaceScope: string,
  agentId: Id<"agents"> | undefined,
  channel: "web" | "whatsapp" | "telegram" | undefined,
) {
  return await ctx.db
    .query("pluginInstalls")
    .withIndex("by_scope_agent_channel", (q) =>
      q.eq("workspaceScope", workspaceScope).eq("agentId", agentId).eq("channel", channel),
    )
    .collect();
}

async function getScopedPolicies(
  ctx: QueryCtx,
  workspaceScope: string,
  agentId: Id<"agents"> | undefined,
  channel: "web" | "whatsapp" | "telegram" | undefined,
) {
  return await ctx.db
    .query("pluginPolicies")
    .withIndex("by_scope_agent_channel", (q) =>
      q.eq("workspaceScope", workspaceScope).eq("agentId", agentId).eq("channel", channel),
    )
    .collect();
}

export const listDefinitions = adminQuery({
  args: {},
  returns: v.array(pluginDefinitionDoc),
  handler: async (ctx) => {
    return await ctx.db.query("pluginDefinitions").collect();
  },
});

export const listInstalls = adminQuery({
  args: {},
  returns: v.array(pluginInstallDoc),
  handler: async (ctx) => {
    return await ctx.db.query("pluginInstalls").collect();
  },
});

export const listPolicies = adminQuery({
  args: {},
  returns: v.array(pluginPolicyDoc),
  handler: async (ctx) => {
    return await ctx.db.query("pluginPolicies").collect();
  },
});

export const upsertDefinition = serviceMutation({
  args: {
    name: v.string(),
    version: v.string(),
    source: v.string(),
    status: v.union(v.literal("active"), v.literal("inactive")),
    manifest: v.any(),
    checksum: v.optional(v.string()),
  },
  returns: v.id("pluginDefinitions"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("pluginDefinitions")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        version: args.version,
        source: args.source,
        status: args.status,
        manifest: args.manifest,
        checksum: args.checksum,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("pluginDefinitions", {
      name: args.name,
      version: args.version,
      source: args.source,
      status: args.status,
      manifest: args.manifest,
      checksum: args.checksum,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertInstall = adminMutation({
  args: {
    workspaceScope: v.string(),
    agentId: v.optional(v.id("agents")),
    channel: v.optional(channelValidator),
    pluginName: v.string(),
    enabled: v.boolean(),
    config: v.optional(v.any()),
  },
  returns: v.id("pluginInstalls"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("pluginInstalls")
      .withIndex("by_scope_agent_channel", (q) =>
        q
          .eq("workspaceScope", args.workspaceScope)
          .eq("agentId", args.agentId)
          .eq("channel", args.channel),
      )
      .filter((q) => q.eq(q.field("pluginName"), args.pluginName))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        config: args.config,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("pluginInstalls", {
      workspaceScope: args.workspaceScope,
      agentId: args.agentId,
      channel: args.channel,
      pluginName: args.pluginName,
      enabled: args.enabled,
      config: args.config,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertPolicy = adminMutation({
  args: {
    workspaceScope: v.string(),
    agentId: v.optional(v.id("agents")),
    channel: v.optional(channelValidator),
    allow: v.optional(v.array(v.string())),
    deny: v.optional(v.array(v.string())),
  },
  returns: v.id("pluginPolicies"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("pluginPolicies")
      .withIndex("by_scope_agent_channel", (q) =>
        q
          .eq("workspaceScope", args.workspaceScope)
          .eq("agentId", args.agentId)
          .eq("channel", args.channel),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        allow: args.allow,
        deny: args.deny,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("pluginPolicies", {
      workspaceScope: args.workspaceScope,
      agentId: args.agentId,
      channel: args.channel,
      allow: args.allow,
      deny: args.deny,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getEffectiveInstallSet = serviceQuery({
  args: {
    workspaceScope: v.string(),
    agentId: v.optional(v.id("agents")),
    channel: v.optional(channelValidator),
  },
  returns: v.array(pluginInstallDoc),
  handler: async (ctx, args) => {
    const layers = await Promise.all([
      getScopedInstalls(ctx, args.workspaceScope, undefined, undefined),
      getScopedInstalls(ctx, args.workspaceScope, undefined, args.channel),
      getScopedInstalls(ctx, args.workspaceScope, args.agentId, undefined),
      getScopedInstalls(ctx, args.workspaceScope, args.agentId, args.channel),
    ]);

    const merged = new Map<string, (typeof layers)[number][number]>();
    for (const layer of layers) {
      for (const install of layer) {
        merged.set(install.pluginName, install);
      }
    }

    return [...merged.values()];
  },
});

export const getEffectivePolicy = serviceQuery({
  args: {
    workspaceScope: v.string(),
    agentId: v.optional(v.id("agents")),
    channel: v.optional(channelValidator),
  },
  returns: v.object({
    allow: v.optional(v.array(v.string())),
    deny: v.optional(v.array(v.string())),
  }),
  handler: async (ctx, args) => {
    const layers = await Promise.all([
      getScopedPolicies(ctx, args.workspaceScope, undefined, undefined),
      getScopedPolicies(ctx, args.workspaceScope, undefined, args.channel),
      getScopedPolicies(ctx, args.workspaceScope, args.agentId, undefined),
      getScopedPolicies(ctx, args.workspaceScope, args.agentId, args.channel),
    ]);

    let allow: string[] | undefined;
    const deny: string[] = [];

    for (const layer of layers) {
      for (const policy of layer) {
        if (policy.allow) {
          allow = allow ? allow.filter((name) => policy.allow!.includes(name)) : [...policy.allow];
        }
        if (policy.deny) {
          deny.push(...policy.deny);
        }
      }
    }

    return {
      ...(allow ? { allow } : {}),
      ...(deny.length > 0 ? { deny: [...new Set(deny)] } : {}),
    };
  },
});

export const upsertDiagnostics = serviceMutation({
  args: {
    name: v.string(),
    diagnosticStatus: diagnosticStatusValidator,
    diagnosticMessages: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pluginDefinitions")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        diagnosticStatus: args.diagnosticStatus,
        diagnosticMessages: args.diagnosticMessages,
        lastDiagnosticAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const listDiagnostics = serviceQuery({
  args: {},
  returns: v.array(
    v.object({
      name: v.string(),
      diagnosticStatus: v.optional(diagnosticStatusValidator),
      diagnosticMessages: v.optional(v.array(v.string())),
      lastDiagnosticAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const defs = await ctx.db.query("pluginDefinitions").collect();
    return defs.map((d) => ({
      name: d.name,
      diagnosticStatus: d.diagnosticStatus,
      diagnosticMessages: d.diagnosticMessages,
      lastDiagnosticAt: d.lastDiagnosticAt,
    }));
  },
});
