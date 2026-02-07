import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import type { Tool } from "ai";
import type { ConvexClient } from "convex/browser";

import { getWebSearchTool } from "../tools/web-search";
import { getPluginToolsByName, listBuiltinPlugins } from "./registry";
import type { ResolvedPluginTools } from "./types";

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

export async function syncBuiltinPluginDefinitions(client: ConvexClient): Promise<void> {
  const plugins = listBuiltinPlugins();
  await Promise.all(
    plugins.map(async (plugin) => {
      await client.mutation(api.plugins.upsertDefinition, {
        name: plugin.name,
        version: plugin.version,
        source: plugin.source,
        status: "active",
        manifest: {
          tools: Object.keys(plugin.tools),
        },
      });
    }),
  );
}

export async function resolvePluginTools(params: {
  client: ConvexClient;
  channel: "web" | "whatsapp";
  agentId?: Id<"agents">;
  modelName: string;
}): Promise<ResolvedPluginTools> {
  const { client, channel, agentId, modelName } = params;
  const [installs, policy] = await Promise.all([
    client.query(api.plugins.getEffectiveInstallSet, {
      workspaceScope: "default",
      agentId,
      channel,
    }),
    client.query(api.plugins.getEffectivePolicy, {
      workspaceScope: "default",
      agentId,
      channel,
    }),
  ]);

  const enabledPluginNames =
    installs.length > 0
      ? installs.filter((install) => install.enabled).map((install) => install.pluginName)
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
