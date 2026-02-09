const FRIENDLY_NAMES: [RegExp, string][] = [
  [/claude-3-5-haiku/i, "Haiku 3.5"],
  [/claude-haiku-4/i, "Haiku 4"],
  [/claude-sonnet-4-5/i, "Sonnet 4.5"],
  [/claude-4-5-sonnet/i, "Sonnet 4.5"],
  [/claude-sonnet-4/i, "Sonnet 4"],
  [/claude-opus-4/i, "Opus 4"],
  [/gpt-4o-mini/i, "GPT-4o Mini"],
  [/gpt-4o/i, "GPT-4o"],
  [/gpt-4-turbo/i, "GPT-4 Turbo"],
  [/gemini-2\.0-flash/i, "Gemini 2.0 Flash"],
  [/gemini-1\.5-pro/i, "Gemini 1.5 Pro"],
];

/** Map a full model ID (e.g. `anthropic:claude-3-5-haiku-20241022`) to a friendly display name. */
export function friendlyModelName(modelId: string): string {
  // Strip provider prefix (e.g. "anthropic:")
  const stripped = modelId.includes(":") ? modelId.split(":").slice(1).join(":") : modelId;

  for (const [pattern, name] of FRIENDLY_NAMES) {
    if (pattern.test(stripped)) return name;
  }

  // Fallback: strip date suffix (e.g. -20241022)
  return stripped.replace(/-\d{8}$/, "");
}
