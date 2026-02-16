import { z } from "zod";

import type { PluginManifest } from "./types";

const pluginRiskLevelSchema = z.enum(["low", "medium", "high"]);
const pluginSourceSchema = z.enum(["builtin", "workspace", "remote"]);
const pluginChannelSchema = z.enum(["web", "whatsapp", "telegram"]);
const pluginKindSchema = z.enum(["builtin", "notes", "tasks", "finance", "integration", "custom"]);

const toolOutputContractSchema = z
  .object({
    outputShape: z.enum(["string", "json", "json-lines", "markdown"]),
    requiresStructuredOutput: z.boolean().optional(),
    requiredFields: z.array(z.string().min(1)).optional(),
  })
  .strict();

const pluginToolDescriptorSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    requiresApproval: z.boolean().optional(),
    outputContract: toolOutputContractSchema.optional(),
  })
  .strict();

const pluginPolicySchema = z
  .object({
    allow: z.array(z.string().min(1)).optional(),
    deny: z.array(z.string().min(1)).optional(),
    alsoAllow: z.array(z.string().min(1)).optional(),
  })
  .strict();

const pluginContextSchema = z
  .object({
    defaultModelTier: z.enum(["lite", "standard", "power"]).optional(),
    workspaceScope: z.string().min(1).optional(),
    sessionKey: z.string().min(1).optional(),
  })
  .strict();

const pluginManifestSchema: z.ZodType<PluginManifest> = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, "id must be lowercase alphanumeric with hyphens"),
    version: z.string().min(1),
    tools: z.array(z.string().min(1)).min(1, "manifest must declare at least one tool"),
    riskLevel: pluginRiskLevelSchema.default("low"),
    source: pluginSourceSchema.default("workspace"),
    channels: z.array(pluginChannelSchema).optional(),
    kind: pluginKindSchema.optional(),
    policy: pluginPolicySchema.optional(),
    toolDescriptors: z.record(z.string(), pluginToolDescriptorSchema).optional(),
    context: pluginContextSchema.optional(),
    configSchema: z.record(z.string(), z.unknown()).optional(),
    requiredPermissions: z.array(z.string().min(1)).optional(),
    description: z.string().optional(),
  })
  .strict();

type PluginManifestValidation =
  | { success: true; data: PluginManifest }
  | { success: false; errors: z.ZodIssue[] };

export function validateManifest(input: unknown): PluginManifestValidation {
  const result = pluginManifestSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues };
}
