import { getDefaultPolicy, mergeToolPolicies, type ToolPolicy } from "./tool-policy";

const NOTE_TOOL_NAMES = [
  "note_list",
  "note_get",
  "note_create",
  "note_update",
  "note_move",
  "note_archive",
  "note_generate_from_conversation",
  "note_transform",
  "note_apply_transform",
  "note_update_from_ai",
] as const;

interface SkillPolicyCarrier {
  config?: {
    toolPolicy?: {
      allow?: string[];
      deny?: string[];
    };
  };
}

export interface LoopToolPolicyResult {
  mergedPolicy: ToolPolicy;
  noteAwarePolicy: ToolPolicy;
  policyMergeSource: string;
  policyFingerprint: string;
}

export interface BuildLoopToolPolicyOptions {
  channel: "web" | "whatsapp" | "telegram";
  skills: SkillPolicyCarrier[];
  pluginPolicy?: {
    allow?: string[];
    deny?: string[];
  };
  agentPolicy?: {
    allow?: string[];
    deny?: string[];
  };
}

export function buildPolicyFingerprint(policy?: ToolPolicy): string {
  const allow = [...(policy?.allow ?? [])].sort().join(",");
  const deny = [...(policy?.deny ?? [])].sort().join(",");
  return `allow:${allow || "<none>"}|deny:${deny || "<none>"}`;
}

export function buildLoopToolPolicy({
  channel,
  skills,
  pluginPolicy,
  agentPolicy,
}: BuildLoopToolPolicyOptions): LoopToolPolicyResult {
  const channelPolicy = getDefaultPolicy(channel);
  const skillPolicy = buildSkillPolicy(skills);
  const policies = [channelPolicy];
  if (skillPolicy) policies.push(skillPolicy);
  if (pluginPolicy) policies.push(pluginPolicy);
  if (agentPolicy) policies.push(agentPolicy);

  const mergedPolicy = policies.length > 1 ? mergeToolPolicies(...policies) : channelPolicy;
  const policyMergeSource = [
    "channel",
    skillPolicy ? "skills" : undefined,
    pluginPolicy ? "plugin" : undefined,
    agentPolicy ? "agent" : undefined,
  ]
    .filter((source): source is string => source !== undefined)
    .join("+");

  const policyFingerprint = buildPolicyFingerprint(mergedPolicy);

  return {
    mergedPolicy,
    policyFingerprint,
    policyMergeSource,
    noteAwarePolicy: applyNoteToolPolicyOverride({
      policy: mergedPolicy,
      channel,
    }),
  };
}

function buildSkillPolicy(skills: SkillPolicyCarrier[]): ToolPolicy | undefined {
  const skillAllow = new Set<string>();
  const skillDeny = new Set<string>();

  for (const skill of skills) {
    const policy = skill.config?.toolPolicy;
    if (!policy) continue;
    if (policy.allow) {
      for (const toolName of policy.allow) skillAllow.add(toolName);
    }
    if (policy.deny) {
      for (const toolName of policy.deny) skillDeny.add(toolName);
    }
  }

  if (skillAllow.size === 0 && skillDeny.size === 0) return undefined;
  return {
    ...(skillAllow.size > 0 ? { allow: [...skillAllow] } : {}),
    ...(skillDeny.size > 0 ? { deny: [...skillDeny] } : {}),
  };
}

function applyNoteToolPolicyOverride({
  policy,
  channel,
}: {
  policy: ToolPolicy;
  channel: "web" | "whatsapp" | "telegram";
}): ToolPolicy {
  if (channel === "telegram") return policy;

  const denied = new Set<string>(policy.deny ?? []);
  const allowed = policy.allow ? [...policy.allow] : [];
  const addOn = NOTE_TOOL_NAMES.filter((name) => !denied.has(name) && !allowed.includes(name));
  if (addOn.length === 0 || allowed.includes("*")) {
    return policy;
  }

  return {
    ...policy,
    allow: [...allowed, ...addOn],
  };
}
