# Zenthor Assist vs OpenClaw: Orchestration and Plugin Notes (Practical Guide for Agent Authors)

## 1) What changed in Zenthor (and why)

Zenthor Assist now shares core ideas with OpenClaw’s policy-driven model, but with a capped production shape:

- Runtime and plugins are still registered in memory (`getGlobalRegistry`) and resolved per-conversation.
- Tool filtering is policy-first (`allow` + `deny`, now with wildcard and `alsoAllow` support).
- Tool outputs are now validated against declared plugin contracts.
- Approval flow can be descriptor-driven (`requiresApproval`) instead of only risk-level-driven.
- Tool metadata is persisted in Convex plugin definitions for future introspection and auditability.

This preserves your notes/tasks “service mindset” while making new capabilities safer to add.

## 2) OpenClaw vs Zenthor Assist: quick comparison

| Area               | OpenClaw reference pattern                     | Zenthor Assist current pattern                                  | Practical impact                                                       |
| ------------------ | ---------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Policy composition | Multi-source policy pipeline (pipeline stages) | Merged channel + skill + plugin + agent policies                | Easier to reason in one code path; less granular policy pipeline state |
| Plugin metadata    | Rich plugin manifests + workspace tooling      | Builtin and extension manifests are moving to richer metadata   | We now align on `manifest`/`toolDescriptors` and policy hints          |
| Tool allow/deny    | Strong allowlist + sandbox controls            | Allow/deny with wildcard and `alsoAllow` merge behavior         | More flexible than basic allowlist, fewer false denies                 |
| Approval           | Explicit approval hooks and allowlists         | Global high-risk default + per-tool descriptor overrides        | Good for fast rollout, still allows sensitive tools to stay gated      |
| Output contracts   | Implicitly schema-driven via tool definitions  | Explicit `outputContract` on tool descriptors + soft validation | Useful for predictable note/task automation output handling            |
| Extensibility      | Plugin-first + deep channel integrations       | Workspace-safe extension points plus static builtin registry    | Slightly narrower than full plugin market, but safer for now           |

## 3) Practical pros/cons of adding a new plugin/skill

### Pros

- One manifest-driven path: add manifest + tool map, then activate in registry flow.
- Optional `toolDescriptors` can declare:
  - `requiresApproval`
  - `outputContract` (`string`, `json`, `json-lines`, `markdown`)
  - optional `requiredFields` when output is structured
- Existing policy engine can gate tools with:
  - policy allow/deny entries
  - per-tool `requiresApproval`
  - default high-risk fallback
- Works naturally with existing note/task workflows because tool contracts and tool map are now propagated to loop + generation.

### Cons / tradeoffs

- No full OpenClaw-style plugin lifecycle automation yet (e.g., filesystem discovery + signed plugin packs).
- Plugin manifest persistence is currently mostly metadata (not a full execution sandbox).
- Fallback strategy depends on current model/tool routing; complex plugin ecosystems still need explicit governance in `pluginPolicies` and manifest risk fields.
- Output contracts are **soft** (non-blocking): violations are annotated/warned, not hard-failed.

## 4) OpenAI/Codex-specific implementation notes (important)

- In this stack, `openai_subscription` mode still needs explicit `providerOptions.openai.instructions`.
- Provider search tool compatibility differences are handled by fallback:
  - Retry without provider search tools on tool/schema errors.
- For Codex/OpenAI-heavy stacks, practical defaults should be:
  1. Keep provider web-search tools explicit in prompt policy (`web_search`/fallback names).
  2. Keep contract validation enabled so model output drift is surfaced in tool messages.
  3. Use `requiresApproval` on sensitive tools first, then tighten with policy once stable.

## 5) Operational notes for future contributors / AI agents

- Keep plugin manifests deterministic:
  - Stable `id/version/tools`, clear `riskLevel`.
  - Only include `toolDescriptors` that are stable and testable.
- For new tool plugins:
  1. Add/update manifest in runtime registry.
  2. Add `toolDescriptors` for high-variance outputs.
  3. Set policy fields (`allow`/`deny`/`alsoAllow`) conservatively.
  4. Run one dry-loop path (non-production conversation) to inspect:
     - `policyResolution.warnings`
     - approval prompts
     - `tool_output.contract_violation` logs
- Prefer small manifest-level policy over hardcoding approvals unless absolutely needed.

## 6) Where to adjust behavior next (suggested)

- Add strict, typed plugin contracts at DB/API boundary for `toolContracts`.
- Move policy merge diagnostics into a dedicated structured event payload (instead of current warnings-only string list).
- Add focused tests:
  - `alsoAllow` behavior
  - `policyResolution.decisions`
  - tool output contract annotations for `json-lines`
