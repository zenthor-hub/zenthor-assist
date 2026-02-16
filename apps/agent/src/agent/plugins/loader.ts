import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { env } from "@zenthor-assist/env/agent";
import type { Tool } from "ai";
import type { ConvexClient } from "convex/browser";

import { filterTools, mergeToolPolicies } from "../tool-policy";
import { getWebSearchTool } from "../tools/web-search";
import { serializeManifest } from "./manifest";
import {
  type PluginRegistry,
  getGlobalRegistry,
  getPluginToolsByName,
  listBuiltinPlugins,
} from "./registry";
import {
  type ActivationResult,
  type PluginPolicy,
  type PluginToolDescriptorMap,
  type PolicyResolution,
  type ResolvedPluginTools,
  type RuntimePlugin,
} from "./types";

interface PluginInstall {
  pluginName: string;
  enabled: boolean;
}

type PluginContext = {
  workspaceScope: string;
  sessionKey?: string;
};

function dedupe(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined;

  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out.length > 0 ? out : undefined;
}

function buildPolicyResolution(
  tools: Record<string, Tool>,
  policy: { allow?: string[]; deny?: string[] },
): {
  policyResolution: PolicyResolution;
  filteredPolicy: { allow?: string[]; deny?: string[] };
} {
  const allow = dedupe(policy.allow);
  const denySet = new Set(dedupe(policy.deny) ?? []);
  const allowAll = allow?.includes("*") ?? false;

  const decisions: Array<{
    tool: string;
    decision: "allow" | "deny" | "unknown";
    reasons: string[];
    sources: string[];
  }> = [];

  const warningSet = new Set<string>();

  const knownTools = new Set<string>(Object.keys(tools).sort());
  for (const allowTool of dedupe(policy.allow) ?? []) {
    if (allowTool !== "*" && !knownTools.has(allowTool)) {
      warningSet.add(`Unknown allowlist tool '${allowTool}' is not currently installed`);
    }
  }

  for (const denyTool of dedupe(policy.deny) ?? []) {
    if (!knownTools.has(denyTool)) {
      warningSet.add(`Unknown denylist tool '${denyTool}' is not currently installed`);
    }
  }

  for (const toolName of [...knownTools].sort()) {
    if (denySet.has(toolName)) {
      decisions.push({
        tool: toolName,
        decision: "deny",
        reasons: ["explicit deny"],
        sources: ["policy"],
      });
      continue;
    }

    if (!allow || allow.length === 0) {
      decisions.push({
        tool: toolName,
        decision: "allow",
        reasons: ["no allowlist configured"],
        sources: ["policy"],
      });
      continue;
    }

    if (allowAll || allow.includes(toolName)) {
      decisions.push({
        tool: toolName,
        decision: "allow",
        reasons: allowAll ? ["wildcard allowlist"] : ["allowlist match"],
        sources: ["policy"],
      });
      continue;
    }

    decisions.push({
      tool: toolName,
      decision: "deny",
      reasons: ["tool not present in allowlist"],
      sources: ["policy"],
    });
  }

  const filteredPolicy = {
    ...(allow ? { allow } : {}),
    ...(denySet.size > 0 ? { deny: [...denySet] } : {}),
  };

  const warnings = [...warningSet].sort();
  return {
    policyResolution: {
      policy: filteredPolicy,
      decisions,
      ...(warnings.length > 0 ? { warnings } : {}),
    },
    filteredPolicy,
  };
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
      const toolContracts = plugin.manifest.toolDescriptors ?? {};
      await client.mutation(api.plugins.upsertDefinition, {
        serviceKey: env.AGENT_SECRET,
        name: plugin.name,
        version: plugin.version,
        source: plugin.source,
        status: "active",
        manifest: serializeManifest(plugin.manifest),
        manifestVersion: plugin.version,
        policyFingerprint: "builtin-default",
        toolContracts,
        riskProfile: plugin.manifest.riskLevel,
      });
    }),
  );
}

export async function resolvePluginTools(params: {
  client: ConvexClient;
  channel: "web" | "whatsapp" | "telegram";
  agentId?: Id<"agents">;
  modelName: string;
  workspaceScope?: string;
  sessionContext?: PluginContext;
}): Promise<ResolvedPluginTools> {
  const {
    client,
    channel,
    agentId,
    modelName,
    workspaceScope = "default",
    sessionContext,
  } = params;
  const effectiveWorkspace = sessionContext?.workspaceScope ?? workspaceScope;
  const [installs, policy] = await Promise.all([
    client.query(api.plugins.getEffectiveInstallSet, {
      serviceKey: env.AGENT_SECRET,
      workspaceScope: effectiveWorkspace,
      agentId,
      channel,
    }),
    client.query(api.plugins.getEffectivePolicy, {
      serviceKey: env.AGENT_SECRET,
      workspaceScope: effectiveWorkspace,
      agentId,
      channel,
    }),
  ]);
  const normalizedInstalls = installs as Array<PluginInstall>;
  const policyLayers: PluginPolicy[] = policy ? [policy as PluginPolicy] : [];
  const registry = getGlobalRegistry();
  const missingPlugins = new Set<string>();

  const enabledPluginNames =
    normalizedInstalls.length > 0
      ? normalizedInstalls.filter((install) => install.enabled).map((install) => install.pluginName)
      : listBuiltinPlugins().map((plugin) => plugin.name);

  const merged: Record<string, Tool> = {};
  const toolContracts: PluginToolDescriptorMap = {};
  for (const pluginName of enabledPluginNames) {
    const toolSet = getPluginToolsByName(pluginName);
    if (!toolSet) {
      missingPlugins.add(pluginName);
      continue;
    }
    const runtimePlugin = registry.getActive(pluginName);
    if (!runtimePlugin) {
      missingPlugins.add(pluginName);
      continue;
    }
    if (runtimePlugin.manifest.policy) {
      policyLayers.push(runtimePlugin.manifest.policy);
    }
    if (runtimePlugin.manifest.toolDescriptors) {
      Object.assign(toolContracts, runtimePlugin.manifest.toolDescriptors);
    }
    Object.assign(merged, toolSet);
  }

  Object.assign(merged, getWebSearchTool(modelName));
  const policyResolution = buildPolicyResolution(merged, mergeToolPolicies(...policyLayers));
  const warnings = new Set<string>(policyResolution.policyResolution.warnings ?? []);
  const filteredPolicy = policyResolution.policyResolution.policy;

  if (missingPlugins.size > 0) {
    for (const pluginName of missingPlugins) {
      warnings.add(`Plugin '${pluginName}' not found in active runtime registry`);
    }
  }

  return {
    tools: filterTools(merged, filteredPolicy) as Record<string, Tool>,
    policy: filteredPolicy,
    toolContracts,
    policyResolution: {
      ...policyResolution.policyResolution,
      warnings: [...warnings],
    },
  };
}
