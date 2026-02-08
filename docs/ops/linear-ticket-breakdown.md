# Linear Ticket Breakdown (Zenthor Assist)

This document contains copy-paste-ready Linear issue templates for the recommended roadmap.

## 1) P0: Add lease metadata fields to agentQueue for crash-safe processing

```md
## Summary

Add lease/ownership fields to `agentQueue` so core jobs can be recovered safely after worker crashes.

## Why

Current core queue processing can leave jobs stuck in `processing` with no owner/expiry metadata.

## Scope

- Add `processorId`, `lockedUntil`, `startedAt`, `lastHeartbeatAt` to `agentQueue`.
- Keep backward compatibility with existing rows.

## Tasks

- [ ] Update schema in `apps/backend/convex/schema.ts`.
- [ ] Update validator/doc shape in `apps/backend/convex/agent.ts`.
- [ ] Ensure reads/writes work with optional fields for old records.

## Acceptance Criteria

- New jobs include lease metadata fields when claimed.
- Existing rows without new fields remain valid.
- Convex deploy passes for schema + functions.

## Test Plan

- Run targeted typecheck/lint for backend workspace.
- Verify queue row shape through local Convex query.

## Out of Scope

- Claim logic changes.
- Heartbeat/requeue behavior.
```

## 2) P0: Implement atomic claim, heartbeat, and stale requeue for core jobs

```md
## Summary

Replace non-leased claim flow with lock-based claim semantics and stale job recovery.

## Why

`claimJob` currently only flips status and can leave jobs stuck forever after crashes.

## Scope

- Add atomic lock claim behavior.
- Add `heartbeatJob` mutation.
- Add `requeueStaleJobs` mutation.

## Tasks

- [ ] Implement lock-aware claim in `apps/backend/convex/agent.ts`.
- [ ] Add heartbeat mutation that extends `lockedUntil`.
- [ ] Add stale-scan mutation to move expired `processing` jobs back to `pending`.
- [ ] Preserve retry/error fields appropriately.

## Acceptance Criteria

- Two workers cannot claim the same job.
- Expired locks are reclaimable.
- Requeue logic only touches jobs with expired lock ownership.

## Test Plan

- Simulate claim contention with two claim attempts.
- Simulate stale lock expiry and verify requeue.

## Out of Scope

- Per-conversation serialization.
- Inbound dedupe.
```

## 3) P0: Enforce per-conversation single active core job

```md
## Summary

Guarantee only one active processing job per `conversationId`.

## Why

Concurrent turns in the same conversation can race and produce inconsistent state.

## Scope

- Add conversation-level guard in claim path.
- Ensure pending jobs for same conversation wait.

## Tasks

- [ ] Update claim path in `apps/backend/convex/agent.ts` to refuse claim when another active job exists for same conversation.
- [ ] Keep behavior deterministic when multiple pending jobs exist for same conversation.

## Acceptance Criteria

- At most one `processing` core job per conversation at any time.
- Other jobs for that conversation remain pending until lock clears.

## Test Plan

- Enqueue multiple jobs for same conversation.
- Run dual-worker claim attempts and verify serialization.

## Out of Scope

- Queue policy tuning (drop/summarize).
```

## 4) P0: Integrate core job heartbeat lifecycle in agent loop

```md
## Summary

Wire heartbeat and lock lifecycle into `startAgentLoop` for long-running model/tool runs.

## Why

Backend leasing only works if worker refreshes lock while processing.

## Scope

- Core worker heartbeats during active job.
- Clean completion/failure lock release behavior.

## Tasks

- [ ] Add periodic heartbeat call in `apps/agent/src/agent/loop.ts` while job is running.
- [ ] Ensure heartbeat stops on completion/failure.
- [ ] Ensure lock finalization is explicit in success and error paths.

## Acceptance Criteria

- Long jobs do not get requeued while healthy.
- Crash/kill scenario still allows stale reclaim later.

## Test Plan

- Manual run with forced long generation.
- Verify lock timestamp updates.
- Verify lock stops updating after completion/failure.

## Out of Scope

- New queue schemas beyond lease metadata.
```

## 5) P0: Add WhatsApp inbound dedupe persistence model

```md
## Summary

Add backend dedupe persistence for inbound channel message IDs.

## Why

Provider retries can produce duplicate inbound events and duplicate queue jobs.

## Scope

- Add dedupe table/index.
- Add mutation/query helpers for check-and-insert semantics.

## Tasks

- [ ] Add table to `apps/backend/convex/schema.ts` for inbound dedupe keys.
- [ ] Add functions module (e.g. `apps/backend/convex/inboundDedupe.ts`) for atomic dedupe check/register.
- [ ] Include channel/account/message-id oriented key fields.

## Acceptance Criteria

- First inbound key is accepted.
- Repeated same key is rejected/skipped.
- Deduped events do not create additional user messages.

## Test Plan

- Re-submit same dedupe key multiple times.
- Verify only first pass succeeds.

## Out of Scope

- UI-level duplicate suppression.
```

## 6) P0: Apply inbound dedupe in WhatsApp handler before messages.send

```md
## Summary

Use backend dedupe check in WhatsApp ingress flow.

## Why

Dedupe model is not effective until handler enforces it in runtime path.

## Scope

- Integrate dedupe check in `handleIncomingMessage`.
- Skip duplicate inbound message processing safely.

## Tasks

- [ ] Update `apps/agent/src/whatsapp/handler.ts` to call dedupe mutation/query before `api.messages.send`.
- [ ] Log dedupe skip event with message identifiers.
- [ ] Keep tool-approval responses working as expected.

## Acceptance Criteria

- Duplicate inbound deliveries do not enqueue duplicate jobs.
- Non-duplicate messages continue normal processing.

## Test Plan

- Replay same inbound payload and verify single queue enqueue.

## Out of Scope

- Queue debouncing policies.
```

## 7) P0: Add reliability tests for queue lock, stale reclaim, serialization, and dedupe

```md
## Summary

Create targeted tests for the new reliability-critical behavior.

## Why

Queue/lease regressions are high risk and hard to debug without deterministic tests.

## Scope

- Core queue lock tests.
- Stale reclaim tests.
- Conversation serialization tests.
- Inbound dedupe tests.

## Tasks

- [ ] Add/extend tests under `apps/agent/src/agent/*.test.ts` and backend function tests where available.
- [ ] Cover contention and recovery paths.
- [ ] Cover duplicate inbound suppression.

## Acceptance Criteria

- New test suite fails if any reliability guard regresses.
- Tests are deterministic and fast enough for PR checks.

## Test Plan

- Run targeted workspace tests and CI-equivalent subset.

## Out of Scope

- Full end-to-end browser automation.
```

## 8) P1: Add WhatsApp auth mode configuration (local vs convex)

```md
## Summary

Introduce `WHATSAPP_AUTH_MODE` to support local filesystem or Convex-backed auth state.

## Why

Production failover needs durable auth strategy, not only local `.whatsapp-auth`.

## Scope

- Env support for `WHATSAPP_AUTH_MODE=local|convex`.
- Runtime branching in WhatsApp connection setup.

## Tasks

- [ ] Update env schema in `packages/env/src/agent.ts`.
- [ ] Update connection path in `apps/agent/src/whatsapp/connection.ts`.
- [ ] Keep `local` as default for developer ergonomics.

## Acceptance Criteria

- Existing local behavior remains unchanged by default.
- Convex mode can be enabled via env only.

## Test Plan

- Boot runtime in both modes and verify startup behavior.

## Out of Scope

- Full Convex adapter implementation details.
```

## 9) P1: Implement Convex-backed Baileys auth adapter using whatsappSession

```md
## Summary

Persist WhatsApp auth credentials/keys in Convex for restart/failover resilience.

## Why

Local-only auth state blocks reliable failover across hosts.

## Scope

- Adapter for read/write/remove of auth entries via `whatsappSession`.
- Integrate adapter into Baileys auth lifecycle.

## Tasks

- [ ] Implement adapter logic in `apps/agent/src/whatsapp/connection.ts`.
- [ ] Use existing APIs in `apps/backend/convex/whatsappSession.ts`.
- [ ] Add migration/compat handling for existing local auth.

## Acceptance Criteria

- Reboot with `WHATSAPP_AUTH_MODE=convex` keeps session.
- No forced re-pairing for routine restarts.

## Test Plan

- Pair once, restart runtime, verify still connected.
- Fail over to second host and verify reconnect path.

## Out of Scope

- Cross-channel auth storage standardization.
```

## 10) P1: Validate WhatsApp failover and lease ownership with runbook-driven tests

```md
## Summary

Add explicit validation scenarios for ownership failover and auth durability.

## Why

Operational readiness needs reproducible checks, not only code-level assumptions.

## Scope

- Lease contention behavior.
- Owner handoff after stop/crash.
- Convex auth persistence checks.

## Tasks

- [ ] Add scenarios to `docs/ops/runbook.md`.
- [ ] Add expected logs/signals for each scenario.
- [ ] Add rollback/fallback notes for failed checks.

## Acceptance Criteria

- Team can follow runbook and verify ownership/failover behavior consistently.
- Failure signals are documented with next actions.

## Test Plan

- Execute runbook end-to-end in staging-like environment.

## Out of Scope

- Automated chaos tooling.
```

## 11) P2: Expand plugin manifest contract for validated runtime loading

```md
## Summary

Extend plugin manifest contract to support stronger runtime validation.

## Why

Current plugin model is static/tools-only and lacks robust manifest semantics.

## Scope

- Formalize manifest fields including `id`, `configSchema`, and risk metadata.
- Keep compatibility with current plugin definitions.

## Tasks

- [ ] Update types in `packages/agent-plugins/src/types.ts`.
- [ ] Update validators in `packages/agent-plugins/src/validators.ts`.
- [ ] Update manifest helpers in `packages/agent-plugins/src/manifest.ts`.
- [ ] Add tests for valid/invalid manifest cases.

## Acceptance Criteria

- Invalid manifest fails fast with clear diagnostics.
- Valid manifests normalize deterministically.

## Test Plan

- Run package tests for manifest/validator suite.

## Out of Scope

- Plugin install CLI.
```

## 12) P2: Build plugin discovery + activation loader with config validation

```md
## Summary

Refactor plugin loading from static map to discovery + validation + activation flow.

## Why

To scale plugin ecosystem, runtime must handle plugin lifecycle dynamically.

## Scope

- Discovery of configured plugin sources.
- Config validation before activation.
- Deterministic load order and conflict handling.

## Tasks

- [ ] Extend `apps/agent/src/agent/plugins/loader.ts` for discovery lifecycle.
- [ ] Refactor `apps/agent/src/agent/plugins/registry.ts` into activation registry.
- [ ] Keep built-in plugins as fallback/default source.

## Acceptance Criteria

- Loader can activate plugins from configured sources.
- Invalid plugin config does not crash entire runtime.
- Tool resolution remains backward compatible for current built-ins.

## Test Plan

- Add loader tests for good/bad plugin configs and conflict cases.

## Out of Scope

- Hook/service/channel/provider plugin surfaces.
```

## 13) P2: Persist plugin diagnostics and status in Convex for operability

```md
## Summary

Store plugin load status/diagnostics so operators can inspect plugin health.

## Why

Runtime-only logs are insufficient for ongoing plugin operations.

## Scope

- Persist diagnostics from loader into Convex plugin data.
- Expose effective status for UI/ops queries.

## Tasks

- [ ] Extend `apps/backend/convex/plugins.ts` for status/diagnostic persistence.
- [ ] Emit diagnostics from loader in `apps/agent/src/agent/plugins/loader.ts`.
- [ ] Ensure stale diagnostics are replaced/updated deterministically.

## Acceptance Criteria

- Operators can query current plugin status and recent errors.
- Diagnostic state matches latest load cycle.

## Test Plan

- Trigger known plugin load error and verify persisted diagnostics.

## Out of Scope

- Control UI implementation.
```

## 14) P3: Standardize agent runtime logging and remove remaining console.\* paths

```md
## Summary

Replace remaining unstructured runtime logs with structured logger events.

## Why

Mixed logging styles reduce traceability and observability quality.

## Scope

- Migrate WhatsApp runtime/connection/handler/sender `console.*` paths to logger.
- Keep concise line logs where useful for operators.

## Tasks

- [ ] Update `apps/agent/src/whatsapp/runtime.ts`.
- [ ] Update `apps/agent/src/whatsapp/connection.ts`.
- [ ] Update `apps/agent/src/whatsapp/handler.ts`.
- [ ] Update `apps/agent/src/whatsapp/sender.ts`.

## Acceptance Criteria

- Runtime paths emit structured logs consistently.
- Human-readable startup/progress logs remain available.

## Test Plan

- Start core + whatsapp and verify logs/events for inbound/outbound lifecycle.

## Out of Scope

- Web logging changes.
```

## 15) P3: Add typed operational events for queue, lease, and recovery lifecycle

```md
## Summary

Define and emit a typed event set for queue/lease health telemetry.

## Why

Incidents require queryable lifecycle events, not only freeform log messages.

## Scope

- Event names/payload contracts for claim, heartbeat, requeue, lease contention, lease loss.
- Emit from runtime and backend touchpoints.

## Tasks

- [ ] Add event typing in `packages/observability/src/types.ts`.
- [ ] Update logger helpers in `apps/agent/src/observability/logger.ts`.
- [ ] Emit events in core and WhatsApp runtimes.

## Acceptance Criteria

- Key reliability transitions are queryable in Axiom.
- Event payloads have stable fields for dashboards/alerts.

## Test Plan

- Run smoke flow and verify expected events are present.

## Out of Scope

- Building full dashboard UI.
```

## 16) P3: Expand ops docs with incident playbooks for queue/lease/auth failures

```md
## Summary

Document clear remediation steps for common runtime incidents.

## Why

Fast recovery depends on explicit playbooks for both developers and AI agents.

## Scope

- Add incident sections for stuck jobs, lease contention, heartbeat loss, auth corruption.
- Include commands, expected logs, and go/no-go criteria.

## Tasks

- [ ] Update `docs/ops/runbook.md`.
- [ ] Update `docs/ops/runtime-topology.md`.
- [ ] Add `docs/ops/incidents.md` if needed for cleaner separation.

## Acceptance Criteria

- On-call can resolve top incidents without code spelunking.
- Decision points and rollback paths are clearly documented.

## Test Plan

- Walkthrough by a teammate not involved in implementation.

## Out of Scope

- Pager/on-call tooling setup.
```

## Suggested Linear Metadata

- Team: `Zenthor Assist`
- Issue identifier: `ZAS`
- Labels: `agent`, `convex`, `whatsapp`, `reliability`, `plugins`, `observability`
- Priority:
  - P0 tickets: `High/Urgent`
  - P1 tickets: `High`
  - P2 tickets: `Normal`
  - P3 tickets: `Normal`

## Suggested Dependency Chain

1. `AGENT-01` -> `AGENT-02` -> `AGENT-04`
2. `AGENT-02` -> `AGENT-03`
3. `AGENT-05` -> `AGENT-06`
4. `AGENT-08` -> `AGENT-09` -> `AGENT-10`
5. `AGENT-11` -> `AGENT-12` -> `AGENT-13`
6. `AGENT-14` and `AGENT-15` after P0 stabilization
7. `AGENT-16` finalization at each phase close
