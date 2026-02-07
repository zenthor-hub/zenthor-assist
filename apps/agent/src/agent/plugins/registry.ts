import type { Tool } from "ai";

import { currentTime } from "../tools/current-time";
import { memorySearch, memoryStore } from "../tools/memory";
import { scheduleTask } from "../tools/schedule";
import type { RuntimePlugin } from "./types";

const coreTimePlugin: RuntimePlugin = {
  name: "core-time",
  version: "1.0.0",
  source: "workspace",
  tools: {
    get_current_time: currentTime,
  },
};

const coreMemoryPlugin: RuntimePlugin = {
  name: "core-memory",
  version: "1.0.0",
  source: "workspace",
  tools: {
    memory_search: memorySearch,
    memory_store: memoryStore,
  },
};

const coreSchedulePlugin: RuntimePlugin = {
  name: "core-schedule",
  version: "1.0.0",
  source: "workspace",
  tools: {
    schedule_task: scheduleTask,
  },
};

const registry = new Map<string, RuntimePlugin>([
  [coreTimePlugin.name, coreTimePlugin],
  [coreMemoryPlugin.name, coreMemoryPlugin],
  [coreSchedulePlugin.name, coreSchedulePlugin],
]);

export function listBuiltinPlugins(): RuntimePlugin[] {
  return [...registry.values()];
}

export function getPluginToolsByName(name: string): Record<string, Tool> | null {
  return registry.get(name)?.tools ?? null;
}
