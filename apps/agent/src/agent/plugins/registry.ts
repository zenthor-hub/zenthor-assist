import type { Tool } from "ai";

import { browseUrl } from "../tools/browse-url";
import { calculate } from "../tools/calculate";
import { currentTime } from "../tools/current-time";
import { dateCalc } from "../tools/date-calc";
import { memorySearch, memoryStore } from "../tools/memory";
import { scheduleTask } from "../tools/schedule";
import type { ActivationResult, RuntimePlugin } from "./types";
import { validateManifest } from "./validators";

const coreTimePlugin: RuntimePlugin = {
  name: "core-time",
  version: "1.0.0",
  source: "builtin",
  manifest: {
    id: "core-time",
    version: "1.0.0",
    tools: ["get_current_time"],
    riskLevel: "low",
    source: "builtin",
    description: "Provides current time information",
  },
  tools: {
    get_current_time: currentTime,
  },
};

const coreMemoryPlugin: RuntimePlugin = {
  name: "core-memory",
  version: "1.0.0",
  source: "builtin",
  manifest: {
    id: "core-memory",
    version: "1.0.0",
    tools: ["memory_search", "memory_store"],
    riskLevel: "low",
    source: "builtin",
    description: "Agent memory storage and retrieval",
  },
  tools: {
    memory_search: memorySearch,
    memory_store: memoryStore,
  },
};

const coreSchedulePlugin: RuntimePlugin = {
  name: "core-schedule",
  version: "1.0.0",
  source: "builtin",
  manifest: {
    id: "core-schedule",
    version: "1.0.0",
    tools: ["schedule_task"],
    riskLevel: "medium",
    source: "builtin",
    description: "Schedule tasks for future execution",
  },
  tools: {
    schedule_task: scheduleTask,
  },
};

const coreWebBrowsePlugin: RuntimePlugin = {
  name: "core-web-browse",
  version: "1.0.0",
  source: "builtin",
  manifest: {
    id: "core-web-browse",
    version: "1.0.0",
    tools: ["browse_url"],
    riskLevel: "low",
    source: "builtin",
    description: "Fetch and extract readable text from web pages",
  },
  tools: {
    browse_url: browseUrl,
  },
};

const coreCalculatorPlugin: RuntimePlugin = {
  name: "core-calculator",
  version: "1.0.0",
  source: "builtin",
  manifest: {
    id: "core-calculator",
    version: "1.0.0",
    tools: ["calculate"],
    riskLevel: "low",
    source: "builtin",
    description: "Evaluate mathematical expressions",
  },
  tools: {
    calculate,
  },
};

const coreDateCalcPlugin: RuntimePlugin = {
  name: "core-date-calc",
  version: "1.0.0",
  source: "builtin",
  manifest: {
    id: "core-date-calc",
    version: "1.0.0",
    tools: ["date_calc"],
    riskLevel: "low",
    source: "builtin",
    description: "Date arithmetic, difference, and info operations",
  },
  tools: {
    date_calc: dateCalc,
  },
};

const builtinPlugins: RuntimePlugin[] = [
  coreTimePlugin,
  coreMemoryPlugin,
  coreSchedulePlugin,
  coreWebBrowsePlugin,
  coreCalculatorPlugin,
  coreDateCalcPlugin,
];

export class PluginRegistry {
  private active = new Map<string, RuntimePlugin>();
  private toolOwners = new Map<string, string>();

  /** Activate a plugin after validating its manifest. */
  activate(plugin: RuntimePlugin): ActivationResult {
    const validation = validateManifest(plugin.manifest);
    if (!validation.success) {
      return {
        pluginName: plugin.name,
        status: "invalid",
        diagnostics: validation.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
      };
    }

    // Check for tool name conflicts with already-active plugins
    const conflicts: string[] = [];
    for (const toolName of Object.keys(plugin.tools)) {
      const owner = this.toolOwners.get(toolName);
      if (owner && owner !== plugin.name) {
        conflicts.push(`tool "${toolName}" conflicts with plugin "${owner}"`);
      }
    }

    if (conflicts.length > 0) {
      return {
        pluginName: plugin.name,
        status: "conflict",
        diagnostics: conflicts,
      };
    }

    this.active.set(plugin.name, plugin);
    for (const toolName of Object.keys(plugin.tools)) {
      this.toolOwners.set(toolName, plugin.name);
    }

    return { pluginName: plugin.name, status: "activated", diagnostics: [] };
  }

  /** Deactivate a plugin by name. Returns true if it was active. */
  deactivate(name: string): boolean {
    const plugin = this.active.get(name);
    if (!plugin) return false;

    for (const toolName of Object.keys(plugin.tools)) {
      if (this.toolOwners.get(toolName) === name) {
        this.toolOwners.delete(toolName);
      }
    }
    this.active.delete(name);
    return true;
  }

  getActive(name: string): RuntimePlugin | null {
    return this.active.get(name) ?? null;
  }

  listActive(): RuntimePlugin[] {
    return [...this.active.values()];
  }

  getToolsByName(name: string): Record<string, Tool> | null {
    return this.active.get(name)?.tools ?? null;
  }

  getAllTools(): Record<string, Tool> {
    const merged: Record<string, Tool> = {};
    for (const plugin of this.active.values()) {
      Object.assign(merged, plugin.tools);
    }
    return merged;
  }

  /** Return tool names from plugins with riskLevel "medium" or "high". */
  getHighRiskToolNames(): Set<string> {
    const names = new Set<string>();
    for (const plugin of this.active.values()) {
      if (plugin.manifest.riskLevel === "medium" || plugin.manifest.riskLevel === "high") {
        for (const toolName of Object.keys(plugin.tools)) {
          names.add(toolName);
        }
      }
    }
    return names;
  }

  clear(): void {
    this.active.clear();
    this.toolOwners.clear();
  }
}

// Global singleton used by the agent runtime
const globalRegistry = new PluginRegistry();

export function getGlobalRegistry(): PluginRegistry {
  return globalRegistry;
}

/** Static list of builtin plugin definitions. */
export function listBuiltinPlugins(): RuntimePlugin[] {
  return builtinPlugins;
}

/** Backward-compatible: get tools by plugin name from global registry. */
export function getPluginToolsByName(name: string): Record<string, Tool> | null {
  return globalRegistry.getToolsByName(name);
}
