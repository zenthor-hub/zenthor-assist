# OpenClaw Comparison Assessment — Feb 16, 2026

This file tracks what from OpenClaw’s latest updates can be adopted in zenthor-assist with value for our two runtime modes:
- **Gateway mode** (`AI_PROVIDER_MODE=gateway`) for production-grade API routing
- **OpenAI subscription mode** (`AI_PROVIDER_MODE=openai_subscription`) for personal Codex-equivalent usage

## What maps directly today

- **Nested sub-agents**: OpenClaw’s agent-spawn model is not the same as our architecture. We keep channel-scoped agents and persona config, not dynamic RPC-based sub-agent spawning.
- **Multi-image tooling**: We do not expose image upload/analysis tool calls yet; no equivalent implementation is in place.
- **LLM I/O hooks**: We currently have custom observability logging around model generate/fallback lifecycle and WhatsApp job events.
- **Security hardening model**: We do not currently have external memory ingestion beyond controlled ingestion surfaces (`memory_store`, compaction), which is still lower risk than OpenClaw’s external DB ingestion model.
- **Channel parity**: We still support Web + WhatsApp only; no Discord, Telegram UI-level features yet.
- **Provider stack**: Gateway remains primary in production; openai_subscription path is supported for user-owned token + streaming semantics.
- **Container/runtime**: We deploy on Railway and keep platform-level boundaries there.

## Actionable plan and implementation status

> Date of change plan execution: 2026-02-16

### P1 — Pre-generation diagnostics in model calls (started)
- **Status:** ✅ Implemented
- **Details:**
  - Added loop-level context diagnostics before generation and passed to `generateResponse*`.
  - New diagnostics passed include:
    - `contextMessageCount`, `contextTokenEstimate`
    - `shouldCompact`, `shouldBlock`
    - `systemPromptChars`
    - `activeToolCount`
    - `policyFingerprint`, `policyMergeSource`
    - `conversationId`, `jobId`, provider mode
  - Both generation paths now emit richer `agent.model.generate.started` and `.completed` fields.
  - Added typed catalog entry for `agent.model.pre_generation_diagnostics`.

### P1 — End-to-end integration coverage
- **Status:** ✅ Implemented
- **Details:**
  - Added `apps/agent/src/agent/loop.integration.test.ts` covering:
    - job claim + context load + generation dispatch
    - pre-generation diagnostics logging (`agent.model.pre_generation_diagnostics`)
    - WhatsApp typing indicator enqueue path
    - assistant outbound enqueue + completion mutation ordering assertions
  - This test is currently a behavior-level harness that validates both direct model-flow and delivery behavior under existing architecture; it is independent of provider mode (gateway vs openai_subscription) for shared loop semantics.

### P2 — `browse_url` SSRF and redirect hardening
- **Status:** ✅ Implemented
- **Details:**
  - Added redirect-aware fetch flow with pre-fetch validation on every hop.
  - Added max redirect guard and explicit failures for redirect loops.
  - Added explicit tests for:
    - redirecting to blocked hosts
    - redirect + DNS rebinding to blocked private ranges
    - IPv6-mapped local targets

### P2 — Model routing + fallback observability unification
- **Status:** ✅ Implemented
- **Details:**
  - Router now emits richer route metadata (`routeTier`, `routeReason`) and shared naming.
  - Fallback logging now includes attempt index and attempted models.
- **Cross-mode impact:**
  - Works in both gateway and openai_subscription; diagnostics include `providerMode` and route metadata to compare behavior.

### P2 — Quick-win doc/actionability tracking
- **Status:** ✅ Implemented
- **Details:**
  - Converted this comparison into a dated, maintainable tracker with completion status.
  - Added implementation notes and value statements for each recommended improvement.

## Bottom line

For our current system, the highest-value fixes are the diagnostic and hardening items that directly reduce uncertainty in model selection, context behavior, and external fetch security.

Priority, now that both provider modes are supported:
1. Keep `P1` generation diagnostics in place (done).
2. Finish/expand loop integration tests for regression confidence.
3. Keep `browse_url` redirect and DNS-rebinding protections active in both provider modes.
4. Continue sharing policy/routing metadata in logs for operational root cause analysis.
