import type { Tool } from "ai";

export type PluginRiskLevel = "low" | "medium" | "high";
export type PluginSource = "builtin" | "workspace" | "remote";
export type PluginChannel = "web" | "whatsapp" | "telegram";
export type PluginKind = "builtin" | "notes" | "tasks" | "finance" | "integration" | "custom";

export interface PluginOutputContract {
  outputShape: "string" | "json" | "json-lines" | "markdown";
  requiresStructuredOutput?: boolean;
  requiredFields?: string[];
}

export interface PluginToolDescriptor {
  name: string;
  description?: string;
  requiresApproval?: boolean;
  outputContract?: PluginOutputContract;
}

export type PluginToolDescriptorMap = Record<string, PluginToolDescriptor>;

export interface PluginPolicy {
  allow?: string[];
  deny?: string[];
  alsoAllow?: string[];
}

/** Validated and normalized plugin manifest. */
export interface PluginManifest {
  id: string;
  version: string;
  tools: string[];
  riskLevel: PluginRiskLevel;
  source: PluginSource;
  channels?: PluginChannel[];
  kind?: PluginKind;
  policy?: PluginPolicy;
  configSchema?: Record<string, unknown>;
  requiredPermissions?: string[];
  description?: string;
  toolDescriptors?: PluginToolDescriptorMap;
  context?: {
    defaultModelTier?: "lite" | "standard" | "power";
    workspaceScope?: string;
    sessionKey?: string;
  };
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

export interface ResolvedToolPolicy {
  tool: string;
  decision: "allow" | "deny" | "unknown";
  reasons: string[];
  sources: string[];
}

export interface PolicyResolution {
  policy: {
    allow?: string[];
    deny?: string[];
    alsoAllow?: string[];
  };
  decisions: ResolvedToolPolicy[];
  warnings?: string[];
}

export interface ResolvedPluginTools {
  tools: Record<string, Tool>;
  policy?: {
    allow?: string[];
    deny?: string[];
    alsoAllow?: string[];
  };
  toolContracts?: PluginToolDescriptorMap;
  policyResolution?: PolicyResolution;
}
