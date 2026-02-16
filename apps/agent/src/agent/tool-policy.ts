interface ToolPolicy {
  allow?: string[];
  deny?: string[];
  alsoAllow?: string[];
}

const PROFESSIONAL_WEB_ALLOWLIST = [
  "get_current_time",
  "calculate",
  "date_calc",
  "memory_search",
  "memory_store",
  "schedule_task",
  "browse_url",
  "web_search",
  "google_search",
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
  "task_create",
  "task_list",
  "task_update",
  "task_complete",
  "task_delete",
  "delegate_to_subagent",
];

const PROFESSIONAL_WHATSAPP_ALLOWLIST = [
  "get_current_time",
  "calculate",
  "date_calc",
  "memory_search",
  "memory_store",
  "schedule_task",
  "browse_url",
  "web_search",
  "google_search",
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
  "task_create",
  "task_list",
  "task_update",
  "task_complete",
  "task_delete",
  "delegate_to_subagent",
];

export function getDefaultPolicy(channel: "web" | "whatsapp" | "telegram"): ToolPolicy {
  if (channel === "whatsapp" || channel === "telegram") {
    return { allow: PROFESSIONAL_WHATSAPP_ALLOWLIST };
  }
  return { allow: PROFESSIONAL_WEB_ALLOWLIST };
}

function dedupe(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined;

  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out.length > 0 ? out : undefined;
}

function unionAlsoAllow(allow?: string[], alsoAllow?: string[]): string[] | undefined {
  const base = dedupe(allow);
  const extra = dedupe(alsoAllow);
  if (!extra) return base;
  if (!base) return extra;
  return dedupe([...base, ...extra]) ?? [...extra];
}

export function filterTools<T extends Record<string, unknown>>(
  tools: T,
  policy: ToolPolicy,
): Partial<T> {
  const toolNames = Object.keys(tools);
  const filtered: Partial<T> = {} as Partial<T>;
  const allowAll = policy.allow?.includes("*") ?? false;
  const allow = dedupe(policy.allow);
  const deny = new Set(dedupe(policy.deny) ?? []);

  for (const name of toolNames) {
    // Deny takes precedence
    if (deny.has(name)) continue;
    // If allow list is set, only include tools in the list
    if (allow !== undefined && !allowAll && !allow.includes(name)) continue;
    (filtered as Record<string, unknown>)[name] = tools[name];
  }

  return filtered;
}

export function mergeToolPolicies(...policies: ToolPolicy[]): ToolPolicy {
  let allow: string[] | undefined;
  let alsoAllow: string[] | undefined;
  let deny: string[] | undefined;

  for (const policy of policies) {
    if (policy.deny) {
      deny = dedupe([...(deny ?? []), ...policy.deny]);
    }
    if (policy.allow) {
      if (allow === undefined || allow.length === 0) {
        allow = dedupe(policy.allow);
      } else {
        // Intersect: only keep names present in both
        const nextAllow = dedupe(policy.allow);
        if (!nextAllow || nextAllow.includes("*")) {
          allow = [...allow];
        } else {
          allow = allow.filter((name) => nextAllow.includes(name));
        }
      }
    }

    if (policy.alsoAllow) {
      alsoAllow = dedupe([...(dedupe(alsoAllow) ?? []), ...(policy.alsoAllow ?? [])]);
    }
  }

  allow = unionAlsoAllow(allow, alsoAllow);

  return {
    ...(allow !== undefined && { allow }),
    ...(deny !== undefined && { deny: [...new Set(deny)] }),
  };
}
