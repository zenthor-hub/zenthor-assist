import { z } from "zod";

const pluginRiskLevelSchema = z.enum(["low", "medium", "high"]);
const pluginSourceSchema = z.enum(["builtin", "workspace", "remote"]);
const pluginChannelSchema = z.enum(["web", "whatsapp", "telegram"]);

const pluginManifestSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "id must be lowercase alphanumeric with hyphens"),
  version: z.string().min(1),
  tools: z.array(z.string().min(1)).min(1, "manifest must declare at least one tool"),
  riskLevel: pluginRiskLevelSchema.default("low"),
  source: pluginSourceSchema.default("workspace"),
  channels: z.array(pluginChannelSchema).optional(),
  configSchema: z.record(z.string(), z.unknown()).optional(),
  requiredPermissions: z.array(z.string().min(1)).optional(),
  description: z.string().optional(),
});

type PluginManifestValidation =
  | { success: true; data: z.infer<typeof pluginManifestSchema> }
  | { success: false; errors: z.ZodIssue[] };

export function validateManifest(input: unknown): PluginManifestValidation {
  const result = pluginManifestSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues };
}
