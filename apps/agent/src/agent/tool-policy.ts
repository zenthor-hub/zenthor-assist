interface ToolPolicy {
  allow?: string[];
  deny?: string[];
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
  "todoist_capture_task",
  "todoist_list_tasks",
  "todoist_complete_task",
  "todoist_reschedule_task",
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
  "todoist_capture_task",
  "todoist_list_tasks",
  "todoist_complete_task",
  "todoist_reschedule_task",
];

export function getDefaultPolicy(channel: "web" | "whatsapp"): ToolPolicy {
  if (channel === "whatsapp") {
    return { allow: PROFESSIONAL_WHATSAPP_ALLOWLIST };
  }
  return { allow: PROFESSIONAL_WEB_ALLOWLIST };
}

export function filterTools<T extends Record<string, unknown>>(
  tools: T,
  policy: ToolPolicy,
): Partial<T> {
  const toolNames = Object.keys(tools);
  const filtered: Partial<T> = {} as Partial<T>;

  for (const name of toolNames) {
    // Deny takes precedence
    if (policy.deny?.includes(name)) continue;
    // If allow list is set, only include tools in the list
    if (policy.allow && !policy.allow.includes(name)) continue;
    (filtered as Record<string, unknown>)[name] = tools[name];
  }

  return filtered;
}

export function mergeToolPolicies(...policies: ToolPolicy[]): ToolPolicy {
  let allow: string[] | undefined;
  let deny: string[] | undefined;

  for (const policy of policies) {
    if (policy.deny) {
      deny = [...(deny ?? []), ...policy.deny];
    }
    if (policy.allow) {
      if (allow === undefined) {
        allow = [...policy.allow];
      } else {
        // Intersect: only keep names present in both
        allow = allow.filter((name) => policy.allow!.includes(name));
      }
    }
  }

  return {
    ...(allow !== undefined && { allow }),
    ...(deny !== undefined && { deny: [...new Set(deny)] }),
  };
}
