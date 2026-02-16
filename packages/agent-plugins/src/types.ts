export type PluginRiskLevel = "low" | "medium" | "high";

export interface PluginContext {
  workspaceScope: string;
  channel: "web" | "whatsapp" | "telegram";
  conversationId: string;
  userId?: string;
  contactId?: string;
  agentId?: string;
}

export type PluginKind = "builtin" | "notes" | "tasks" | "finance" | "integration" | "custom";

export interface ToolOutputContract {
  outputShape: "string" | "json" | "json-lines" | "markdown";
  requiresStructuredOutput?: boolean;
  requiredFields?: string[];
}

export interface PluginToolDescriptor {
  name: string;
  description?: string;
  requiresApproval?: boolean;
  outputContract?: ToolOutputContract;
}

export type PluginToolDescriptorMap = Record<string, PluginToolDescriptor>;

export interface PluginPolicy {
  allow?: string[];
  deny?: string[];
  alsoAllow?: string[];
}

export interface PluginContextHint {
  defaultModelTier?: "lite" | "standard" | "power";
  workspaceScope?: string;
  sessionKey?: string;
}

export interface PluginManifest {
  name: string;
  version: string;
  tools: string[];
  capabilities?: string[];
  requiredEnv?: string[];
  riskLevel?: PluginRiskLevel;
  kind?: PluginKind;
  policy?: PluginPolicy;
  channels?: Array<"web" | "whatsapp" | "telegram">;
  context?: PluginContextHint;
  sourceType?: "builtin" | "remote" | "workspace";
  toolDescriptors?: PluginToolDescriptorMap;
}
