# Agent Runtime Topology Notes

This note is the source of truth for deciding how to run `apps/agent` in dev and production.

## Core Decision

- Keep a single codebase/workspace: `apps/agent`.
- Run separate runtime instances by role (do not rely on one multipurpose process in production).
- Keep agent and backend `AGENT_SECRET` values aligned; service-authenticated Convex endpoints fail closed in production when missing/mismatched.

## Roles and Purpose

| Role               | What it does                                                                | Scale guidance                             |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------ |
| `core`             | Subscribes to agent jobs and runs AI/tool execution                         | Can scale horizontally                     |
| `whatsapp`         | Owns WhatsApp connection, receives inbound messages, sends outbound queue   | One active owner per `WHATSAPP_ACCOUNT_ID` |
| `whatsapp-cloud`   | Handles WhatsApp Cloud API ingress/egress                                   | Dedicated channel runtime                  |
| `whatsapp-ingress` | WhatsApp receive path only                                                  | Advanced/debug usage                       |
| `whatsapp-egress`  | WhatsApp send path only                                                     | Advanced/debug usage                       |
| `telegram`         | Handles Telegram inbound webhook + outbound send queue for a single service | Scale workers by account/channel           |
| `all`              | Runs `core` + `whatsapp` in one process                                     | Local/dev only                             |

## Recommended Deployment Patterns

### Local development

1. Run `AGENT_ROLE=core ENABLE_WHATSAPP=false`.
2. Run `AGENT_ROLE=whatsapp ENABLE_WHATSAPP=true`.
3. Run `AGENT_ROLE=telegram TELEGRAM_BOT_TOKEN=<token>`.

### Production

1. Deploy a dedicated `core` worker service.
2. Deploy a dedicated `whatsapp` worker service.
3. Deploy a dedicated `telegram` worker service.
4. Keep one active WhatsApp owner per account/phone (`WHATSAPP_ACCOUNT_ID`).

## Concurrency and Ownership Rules

- WhatsApp runtime uses Convex lease ownership (`whatsappLeases`) to prevent split-brain sending.
- Only one worker should hold lease ownership for a given `WHATSAPP_ACCOUNT_ID`.
- A second WhatsApp worker for the same account should stay in contention/retry and not send.
- Telegram runtime is queue-consumer based on `delivery` table entries and job `channel`, and should include role-specific credentials (`TELEGRAM_BOT_TOKEN`) in its service.
- All service-to-Convex calls from workers should include `serviceKey` (`AGENT_SECRET`) on each request.

## When To Proceed (Go/No-Go Checklist)

Proceed with rollout when all are true:

1. `core` processes jobs end-to-end without WhatsApp enabled.
2. `whatsapp` acquires lease and keeps heartbeat healthy.
3. Telegram worker starts and sends successfully via `TELEGRAM_BOT_TOKEN`.
4. Outbound messages are sent only by the active WhatsApp lease owner.
5. A second WhatsApp worker with the same account cannot take over while lease is healthy.

Do not proceed if any are true:

1. Two WhatsApp runtimes can send for the same `WHATSAPP_ACCOUNT_ID`.
2. Lease heartbeat frequently drops under normal network conditions.
3. Telegram runtime is missing required token/secrets in its target environment.
4. `AGENT_ROLE=all` is being used as the production shape.

## Railway Deployment

- Agent services (`agent-core`, `agent-whatsapp-cloud`, `agent-whatsapp`, `agent-telegram`) are deployed on Railway.
- Keep env vars scoped per **service + environment**. A value set on `agent-core` (development) does not automatically apply to `agent-whatsapp-cloud` (development), nor to production.
- Sync shared runtime vars across the relevant services explicitly (`AGENT_SECRET`, `AXIOM_TOKEN`, `AXIOM_DATASET`, `OBS_*`, provider/model vars, and any channel-specific credentials).
- Deployments are triggered automatically by GitHub pushes — do not deploy directly via Railway MCP unless explicitly asked.
- **Env var changes on Railway require a redeploy to take effect.** Railway stores the new value immediately, but the running container keeps the old values in memory until it restarts. If you update an env var without a code push, the service must be manually redeployed from the Railway dashboard or via a commit push to pick up the new vars.
- When using Railway MCP to set env vars, always use `skipDeploys=true` (deployments are GitHub-linked). The next `git push` will trigger a redeploy that picks up the new vars.

## Notes for AI Agents and Contributors

- Default recommendation is always split runtime (`core` + `whatsapp` + `telegram`), same repo.
- Prefer `AGENT_ROLE=all` only for quick local smoke tests.
- If asked to scale WhatsApp for the same phone/account, the correct answer is no active-active for that account; use failover via lease, not active-active.
- If asked to split ingress and egress into separate live services, verify ownership/partitioning design first.
- Optional Todoist integration is backend-driven (OAuth + API calls in Convex); it does not change role topology but requires Todoist OAuth env vars in backend config.

## Related Docs

- `docs/ops/runbook.md`
- `docs/ops/incidents.md`
- `docs/ops/refactor-summary.md`
