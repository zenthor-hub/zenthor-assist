const FRIENDLY_NAMES: [RegExp, string][] = [
  // OpenAI Codex models (order matters — more specific patterns first)
  [/gpt-5\.3-codex-spark/i, "GPT-5.3 Codex Spark"],
  [/gpt-5\.3-codex/i, "GPT-5.3 Codex"],
  [/gpt-5\.2-codex/i, "GPT-5.2 Codex"],
  [/gpt-5\.1-codex-mini/i, "GPT-5.1 Codex Mini"],
  [/gpt-5\.1-codex/i, "GPT-5.1 Codex"],
  // OpenAI GPT models
  [/gpt-5\.2/i, "GPT-5.2"],
  [/gpt-5/i, "GPT-5"],
  [/gpt-4o-mini/i, "GPT-4o Mini"],
  [/gpt-4o/i, "GPT-4o"],
  [/gpt-4-turbo/i, "GPT-4 Turbo"],
  // xAI Grok models
  [/grok-4\.1-fast-reasoning/i, "Grok 4.1 Fast"],
  [/grok-4\.1/i, "Grok 4.1"],
  [/grok-3/i, "Grok 3"],
  // Anthropic Claude models
  [/claude-3-5-haiku/i, "Haiku 3.5"],
  [/claude-haiku-4/i, "Haiku 4"],
  [/claude-sonnet-4-5/i, "Sonnet 4.5"],
  [/claude-4-5-sonnet/i, "Sonnet 4.5"],
  [/claude-sonnet-4/i, "Sonnet 4"],
  [/claude-opus-4/i, "Opus 4"],
  // Google Gemini models
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
