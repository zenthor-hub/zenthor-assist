# Agent Runtime Topology Notes

This note is the source of truth for deciding how to run `apps/agent` in dev and production.

## Core Decision

- Keep a single codebase/workspace: `apps/agent`.
- Run separate runtime instances by role (do not rely on one multipurpose process in production).
- Keep agent and backend `AGENT_SECRET` values aligned; service-authenticated Convex endpoints fail closed in production when missing/mismatched.

## Roles and Purpose

| Role               | What it does                                                              | Scale guidance                             |
| ------------------ | ------------------------------------------------------------------------- | ------------------------------------------ |
| `core`             | Subscribes to agent jobs and runs AI/tool execution                       | Can scale horizontally                     |
| `whatsapp`         | Owns WhatsApp connection, receives inbound messages, sends outbound queue | One active owner per `WHATSAPP_ACCOUNT_ID` |
| `all`              | Runs `core` + `whatsapp` in one process                                   | Local/dev only                             |
| `whatsapp-ingress` | WhatsApp receive path only                                                | Advanced/debug usage                       |
| `whatsapp-egress`  | WhatsApp send path only                                                   | Advanced/debug usage                       |

## Recommended Deployment Patterns

### Local development

1. Run `AGENT_ROLE=core ENABLE_WHATSAPP=false`.
2. Run `AGENT_ROLE=whatsapp ENABLE_WHATSAPP=true`.

### Production

1. Deploy a dedicated `core` worker service.
2. Deploy a dedicated `whatsapp` worker service.
3. Keep one active WhatsApp owner per account/phone (`WHATSAPP_ACCOUNT_ID`).

## Concurrency and Ownership Rules

- The WhatsApp runtime uses Convex lease ownership (`whatsappLeases`) to prevent split-brain sending.
- Only one worker should hold lease ownership for a given `WHATSAPP_ACCOUNT_ID`.
- A second WhatsApp worker for the same account should stay in contention/retry and not send.
- All service-to-Convex calls from workers should include `serviceKey` (`AGENT_SECRET`) on each request.

## When To Proceed (Go/No-Go Checklist)

Proceed with rollout when all are true:

1. `core` processes jobs end-to-end without WhatsApp enabled.
2. `whatsapp` acquires lease and keeps heartbeat healthy.
3. Outbound messages are sent only by the active lease owner.
4. A second worker with the same account cannot take over while lease is healthy.

Do not proceed if any are true:

1. Two runtimes can send for the same `WHATSAPP_ACCOUNT_ID`.
2. Lease heartbeat frequently drops under normal network conditions.
3. `AGENT_ROLE=all` is being used as the production shape.

## Railway Deployment

- Agent services (`agent-core`, `agent-whatsapp-cloud`) are deployed on Railway.
- Deployments are triggered automatically by GitHub pushes — do not deploy directly via Railway MCP unless explicitly asked.
- **Env var changes on Railway require a redeploy to take effect.** Railway stores the new value immediately, but the running container keeps the old values in memory until it restarts. If you update an env var without a code push, the service must be manually redeployed from the Railway dashboard or via a commit push to pick up the change.
- When using Railway MCP to set env vars, always use `skipDeploys=true` (deployments are GitHub-linked). The next `git push` will trigger a redeploy that picks up the new vars.

## Notes for AI Agents and Contributors

- Default recommendation is always split runtime (`core` + `whatsapp`), same repo.
- Prefer `AGENT_ROLE=all` only for quick local smoke tests.
- If asked to scale WhatsApp for the same phone/account, the correct answer is no horizontal scaling for that account; use failover via lease, not active-active.
- If asked to split ingress and egress into separate live services for the same account, treat this as non-default and verify lease/ownership design first.
- Optional Todoist integration is backend-driven (OAuth + API calls in Convex); it does not change role topology but requires Todoist OAuth env vars in backend config.

## Related Docs

- `docs/ops/runbook.md`
- `docs/ops/incidents.md`
- `docs/ops/refactor-summary.md`
