import type { PluginManifest } from "./types";

export function createManifest(input: PluginManifest): PluginManifest {
  const uniqueToolDescriptors = input.toolDescriptors
    ? Object.fromEntries(Object.entries(input.toolDescriptors).map(([toolName, descriptor]) => [toolName, descriptor]))
    : undefined;

  return {
    ...input,
    tools: [...new Set(input.tools)],
    capabilities: input.capabilities ? [...new Set(input.capabilities)] : undefined,
    requiredEnv: input.requiredEnv ? [...new Set(input.requiredEnv)] : undefined,
    toolDescriptors: uniqueToolDescriptors,
  };
}
