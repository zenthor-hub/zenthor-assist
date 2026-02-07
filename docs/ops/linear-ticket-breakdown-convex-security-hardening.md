# Linear Ticket Breakdown (Convex Security Hardening)

This document contains copy-paste-ready Linear issue drafts based on the Convex-focused implementation review completed on 2026-02-07.

## 0) Epic: Harden Convex trust boundaries and service control plane

```md
## Summary
Harden Convex backend security by enforcing authentication, row-level authorization, and service-only boundaries for agent/WhatsApp control-plane functions.

## Why
Current implementation exposes several public functions without ownership checks, enabling cross-user data access and queue/runtime tampering.

## Priority
P0

## Labels
security
convex
backend

## Scope
- Establish clear boundary between user-facing APIs and service-only APIs.
- Enforce identity-based access checks for all user data paths.
- Protect queue, delivery, lease, and session operations from public callers.
- Add tests for unauthorized access and IDOR regressions.

## Success Metrics
- Unauthorized user cannot read or mutate another user's conversation, messages, approvals, or phone verification state.
- Public clients cannot claim/complete/fail queue or delivery jobs.
- Agent/WhatsApp runtimes continue functioning with explicit trusted path.
```

## 1) P0: Add shared Convex auth/authorization helpers and adopt them broadly

```md
## Summary
Create reusable auth helpers (`requireUser`, `requireOwnership`, optional `requireRole`) and apply them to Convex modules that currently trust caller-provided IDs.

## Why
Authorization checks are inconsistent and mostly absent, creating repeated IDOR risk across modules.

## Priority
P0

## Labels
security
convex
backend

## Scope
- Add helper module (for example `apps/backend/convex/lib/auth.ts`) with:
  - identity resolution from `ctx.auth.getUserIdentity()`
  - current user lookup by `externalId`
  - common ownership assertion helpers
- Use helpers in conversation/message/tool-approval/phone-verification/user functions.

## Acceptance Criteria
- [ ] Centralized helper exists and is used by all user-facing mutations/queries that touch user data.
- [ ] Unauthorized callers receive consistent auth/forbidden errors.
- [ ] No function relies only on caller-provided `userId` for authorization decisions.

## Test Plan
- Add targeted tests for unauthenticated and cross-user calls.
- Verify authorized caller still succeeds for expected paths.
```

## 2) P0: Enforce row-level authorization for conversations, messages, and approvals

```md
## Summary
Lock conversation/message/tool-approval APIs to resource owners and remove implicit trust in route/argument IDs.

## Why
Current endpoints can return or mutate resources for arbitrary IDs when called by authenticated users.

## Priority
P0

## Labels
security
convex
web

## Scope
- Secure:
  - `conversations.get`, `conversations.listByUser`, `conversations.listByContact`, `conversations.create`, `conversations.archive`, `conversations.updateTitle`
  - `messages.send`, `messages.listByConversation`, `messages.get`
  - `toolApprovals.getPendingByConversation`, `toolApprovals.resolve`, and related by-job lookups as needed
- Validate ownership for both web conversations (`userId`) and linked WhatsApp conversations (`contact.userId`).
- Ensure mutations verify target resource belongs to current actor before patch/insert side effects.

## Acceptance Criteria
- [ ] User can only access their own conversations and related messages/approvals.
- [ ] Cross-user ID probes return null/not-found/forbidden (no data leakage).
- [ ] Chat UI keeps functioning for authorized users.

## Test Plan
- Add tests for same-user success and cross-user denial.
- Manual verification through web chat route using valid and invalid conversation IDs.

## References
- `apps/backend/convex/conversations.ts`
- `apps/backend/convex/messages.ts`
- `apps/backend/convex/toolApprovals.ts`
```

## 3) P0: Bind phone verification and user bootstrap to authenticated identity

```md
## Summary
Remove trust in client-supplied user IDs for phone verification flows and harden user bootstrap mutation against identity spoofing.

## Why
Phone verification and get-or-create user flows currently allow caller-controlled identity arguments.

## Priority
P0

## Labels
security
convex
auth

## Scope
- Update `phoneVerification.requestVerification`, `confirmVerification`, `getVerificationStatus`, `unlinkPhone` to derive actor from auth identity.
- Remove or strictly validate `userId` args for user-facing calls.
- Update `users.getOrCreateFromClerk` to bind to authenticated identity subject instead of arbitrary `externalId` input.
- Update web callers accordingly (`AppLayout`, settings phone verification UI).

## Acceptance Criteria
- [ ] Logged-in user can only verify/unlink their own phone.
- [ ] User creation/upsert cannot be performed for another Clerk subject.
- [ ] Existing login and settings flows remain functional.

## Test Plan
- Add tests for spoofed `userId` rejection.
- Manual test: sign in, create user, verify phone, unlink phone.

## References
- `apps/backend/convex/phoneVerification.ts`
- `apps/backend/convex/users.ts`
- `apps/web/src/app/(app)/layout.tsx`
- `apps/web/src/components/settings/phone-verification.tsx`
```

## 4) P0: Convert queue/delivery control-plane APIs to service-only boundaries

```md
## Summary
Prevent public clients from mutating core queue and delivery execution state; expose only trusted service paths.

## Why
Public access to claim/complete/fail/retry operations allows job tampering and denial-of-service.

## Priority
P0

## Labels
security
convex
agent

## Scope
- Move sensitive operations to internal functions (or trusted HTTP actions) for:
  - `agent.claimJob`, `agent.completeJob`, `agent.failJob`, `agent.retryJob`, `agent.heartbeatJob`, `agent.getPendingJobs`, `agent.getConversationContext`
  - `delivery.claimNextOutbound`, `delivery.completeOutbound`, `delivery.failOutbound`
- Keep minimal public surface for user-initiated actions only.
- Update agent runtime call sites to use new trusted path.

## Acceptance Criteria
- [ ] Untrusted/public clients cannot call queue/delivery control-plane transitions.
- [ ] Agent runtime still processes jobs end-to-end.
- [ ] Unauthorized attempts are logged and rejected.

## Test Plan
- Integration test for agent loop happy path.
- Negative tests for public client attempts to call control-plane operations.

## References
- `apps/backend/convex/agent.ts`
- `apps/backend/convex/delivery.ts`
- `apps/agent/src/agent/loop.ts`
```

## 5) P0: Protect WhatsApp session and lease management endpoints

```md
## Summary
Restrict WhatsApp auth session and lease/account operations to trusted service callers only.

## Why
Public session and lease endpoints can allow session deletion, lease contention, or runtime disruption.

## Priority
P0

## Labels
security
convex
whatsapp

## Scope
- Restrict:
  - `whatsappSession.get/set/remove/getAll/clearAll`
  - `whatsappLeases.upsertAccount/acquireLease/heartbeatLease/releaseLease/getLease/listOwnedAccounts`
- Use internal functions or a trusted gateway with service auth secret.
- Ensure WhatsApp runtime keeps compatibility in configured auth mode.

## Acceptance Criteria
- [ ] Public clients cannot read/write WhatsApp session data.
- [ ] Lease operations are inaccessible to untrusted callers.
- [ ] WhatsApp ingress/egress runtime remains stable.

## Test Plan
- Runtime smoke test for lease acquisition/heartbeat/release.
- Negative tests for unauthorized function invocation.

## References
- `apps/backend/convex/whatsappSession.ts`
- `apps/backend/convex/whatsappLeases.ts`
- `apps/agent/src/whatsapp/runtime.ts`
```

## 6) P1: Restrict admin/config modules (skills, agents, plugins, contacts, users list)

```md
## Summary
Add admin/role checks (or remove from public surface) for workspace-wide configuration and directory endpoints.

## Why
Current functions expose global config and contact/user data without explicit authorization.

## Priority
P1

## Labels
security
convex
admin

## Scope
- Review and secure:
  - `skills.*`
  - `agents.*`
  - `plugins.*`
  - `contacts.list/update/create` (as appropriate)
  - `users.list`
- Introduce role model in user profile or workspace policy if needed.
- Hide or gate UI actions that assume elevated permissions.

## Acceptance Criteria
- [ ] Non-admin users cannot modify global skills/agents/plugins.
- [ ] Sensitive list endpoints require explicit permission.
- [ ] Authorized admin workflows remain functional.

## Test Plan
- Role-based tests for admin and non-admin paths.
- Manual test through skills/settings UI with restricted account.

## References
- `apps/backend/convex/skills.ts`
- `apps/backend/convex/agents.ts`
- `apps/backend/convex/plugins.ts`
- `apps/backend/convex/contacts.ts`
- `apps/backend/convex/users.ts`
```

## 7) P1: Align function return contracts and reduce `v.any()` in sensitive paths

```md
## Summary
Bring Convex function handlers in line with declared `returns` validators and replace broad `v.any()` where practical.

## Why
Validator/handler mismatch and broad untyped payloads make behavior less predictable and harder to secure.

## Priority
P1

## Labels
convex
backend
quality

## Scope
- Ensure `returns: v.null()` handlers explicitly return `null`.
- Inventory `v.any()` fields/args in security-sensitive modules and replace with structured validators where feasible.
- Keep backward compatibility for persisted data where necessary.

## Acceptance Criteria
- [ ] No handler declares `v.null()` without returning `null`.
- [ ] Sensitive user-facing args no longer use `v.any()` unless justified.
- [ ] Typecheck/lint pass for backend workspace.

## Test Plan
- Run backend lint/typecheck.
- Add targeted tests for updated validator behavior.
```

## 8) P1: Add regression tests for authorization and service-boundary enforcement

```md
## Summary
Add focused tests that fail on cross-user access, unauthenticated access, and public invocation of service-only operations.

## Why
Security regressions in Convex functions are high-impact and easy to reintroduce without automated coverage.

## Priority
P1

## Labels
security
tests
convex

## Scope
- Add tests for:
  - conversation/message/tool-approval ownership checks
  - phone verification identity binding
  - queue/delivery/lease/session service-only restrictions
  - admin-only config endpoints

## Acceptance Criteria
- [ ] Test suite fails when a user can access another user's resources.
- [ ] Test suite fails when public callers reach service-only operations.
- [ ] New security tests are deterministic and run in CI.

## Test Plan
- Run targeted tests during implementation.
- Run repo CI-equivalent checks before merge.
```

## Suggested Execution Order

1. Ticket 1 (auth helpers)  
2. Ticket 2 and Ticket 3 (row-level security + identity binding)  
3. Ticket 4 and Ticket 5 (service-only boundaries)  
4. Ticket 6 (admin/config authorization)  
5. Ticket 7 and Ticket 8 (quality + regression safety net)

