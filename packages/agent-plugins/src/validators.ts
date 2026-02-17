import { z } from "zod";

export const pluginRiskLevelSchema = z.union([
  z.literal("low"),
  z.literal("medium"),
  z.literal("high"),
]);

const pluginSourceSchema = z.enum(["builtin", "remote", "workspace"]);
const pluginKindSchema = z.enum(["builtin", "notes", "tasks", "finance", "integration", "custom"]);
const pluginChannelSchema = z.enum(["web", "whatsapp", "telegram"]);

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
    strict: z.boolean().optional(),
    inputExamples: z
      .array(
        z.object({
          input: z.record(z.unknown()),
        }),
      )
      .optional(),
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

const pluginContextHintSchema = z
  .object({
    defaultModelTier: z.enum(["lite", "standard", "power"]).optional(),
    workspaceScope: z.string().min(1).optional(),
    sessionKey: z.string().min(1).optional(),
  })
  .strict();

export const pluginManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  tools: z.array(z.string().min(1)).min(1),
  capabilities: z.array(z.string().min(1)).optional(),
  requiredEnv: z.array(z.string().min(1)).optional(),
  riskLevel: pluginRiskLevelSchema.optional(),
  kind: pluginKindSchema.optional(),
  policy: pluginPolicySchema.optional(),
  channels: z.array(pluginChannelSchema).optional(),
  context: pluginContextHintSchema.optional(),
  sourceType: pluginSourceSchema.optional(),
  toolDescriptors: z.record(pluginToolDescriptorSchema).optional(),
});
