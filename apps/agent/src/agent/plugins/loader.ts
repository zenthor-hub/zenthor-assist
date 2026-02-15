import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { env } from "@zenthor-assist/env/agent";
import type { Tool } from "ai";
import type { ConvexClient } from "convex/browser";

import { getWebSearchTool } from "../tools/web-search";
import { serializeManifest } from "./manifest";
import {
  type PluginRegistry,
  getGlobalRegistry,
  getPluginToolsByName,
  listBuiltinPlugins,
} from "./registry";
import type { ActivationResult, ResolvedPluginTools, RuntimePlugin } from "./types";

interface PluginInstall {
  pluginName: string;
  enabled: boolean;
}

function filterByPolicy(
  tools: Record<string, Tool>,
  policy?: { allow?: string[]; deny?: string[] },
): Record<string, Tool> {
  if (!policy) return tools;
  const out: Record<string, Tool> = {};
  for (const [name, tool] of Object.entries(tools)) {
    if (policy.deny?.includes(name)) continue;
    if (policy.allow && !policy.allow.includes(name)) continue;
    out[name] = tool;
  }
  return out;
}

/**
 * Discover and activate plugins into a registry.
 * - Activates builtins first (deterministic order: alphabetical by name)
 * - Additional sources can be passed for future extensibility
 * - Invalid or conflicting plugins are skipped with diagnostics
 * - Never throws — returns results for all plugins
 */
export function discoverAndActivate(
  registry: PluginRegistry = getGlobalRegistry(),
  additionalPlugins: RuntimePlugin[] = [],
): ActivationResult[] {
  const results: ActivationResult[] = [];

  // Builtins first, sorted by name for deterministic order
  const builtins = [...listBuiltinPlugins()].sort((a, b) => a.name.localeCompare(b.name));
  for (const plugin of builtins) {
    results.push(registry.activate(plugin));
  }

  // Additional plugins sorted by name
  const extras = [...additionalPlugins].sort((a, b) => a.name.localeCompare(b.name));
  for (const plugin of extras) {
    results.push(registry.activate(plugin));
  }

  return results;
}

/** Persist activation diagnostics to Convex for operability. */
export async function syncDiagnostics(
  client: ConvexClient,
  results: ActivationResult[],
): Promise<void> {
  await Promise.all(
    results.map(async (result) => {
      await client.mutation(api.plugins.upsertDiagnostics, {
        serviceKey: env.AGENT_SECRET,
        name: result.pluginName,
        diagnosticStatus: result.status,
        diagnosticMessages: result.diagnostics,
      });
    }),
  );
}

export async function syncBuiltinPluginDefinitions(client: ConvexClient): Promise<void> {
  const plugins = listBuiltinPlugins();
  await Promise.all(
    plugins.map(async (plugin) => {
      await client.mutation(api.plugins.upsertDefinition, {
        serviceKey: env.AGENT_SECRET,
        name: plugin.name,
        version: plugin.version,
        source: plugin.source,
        status: "active",
        manifest: serializeManifest(plugin.manifest),
      });
    }),
  );
}

export async function resolvePluginTools(params: {
  client: ConvexClient;
  channel: "web" | "whatsapp" | "telegram";
  agentId?: Id<"agents">;
  modelName: string;
}): Promise<ResolvedPluginTools> {
  const { client, channel, agentId, modelName } = params;
  const [installs, policy] = await Promise.all([
    client.query(api.plugins.getEffectiveInstallSet, {
      serviceKey: env.AGENT_SECRET,
      workspaceScope: "default",
      agentId,
      channel,
    }),
    client.query(api.plugins.getEffectivePolicy, {
      serviceKey: env.AGENT_SECRET,
      workspaceScope: "default",
      agentId,
      channel,
    }),
  ]);
  const normalizedInstalls = installs as Array<PluginInstall>;

  const enabledPluginNames =
    normalizedInstalls.length > 0
      ? normalizedInstalls.filter((install) => install.enabled).map((install) => install.pluginName)
      : listBuiltinPlugins().map((plugin) => plugin.name);

  const merged: Record<string, Tool> = {};
  for (const pluginName of enabledPluginNames) {
    const toolSet = getPluginToolsByName(pluginName);
    if (!toolSet) continue;
    Object.assign(merged, toolSet);
  }

  Object.assign(merged, getWebSearchTool(modelName));

  return {
    tools: filterByPolicy(merged, policy),
    policy,
  };
}
