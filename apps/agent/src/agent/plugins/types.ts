import type { Tool } from "ai";

export type PluginRiskLevel = "low" | "medium" | "high";
export type PluginSource = "builtin" | "workspace" | "remote";
export type PluginChannel = "web" | "whatsapp" | "telegram";

/** Validated and normalized plugin manifest. */
export interface PluginManifest {
  id: string;
  version: string;
  tools: string[];
  riskLevel: PluginRiskLevel;
  source: PluginSource;
  channels?: PluginChannel[];
  configSchema?: Record<string, unknown>;
  requiredPermissions?: string[];
  description?: string;
}

export interface RuntimePlugin {
  name: string;
  version: string;
  source: string;
  manifest: PluginManifest;
  tools: Record<string, Tool>;
}

export type ActivationStatus = "activated" | "conflict" | "invalid";

export interface ActivationResult {
  pluginName: string;
  status: ActivationStatus;
  diagnostics: string[];
}

export interface ResolvedPluginTools {
  tools: Record<string, Tool>;
  policy?: {
    allow?: string[];
    deny?: string[];
  };
}
