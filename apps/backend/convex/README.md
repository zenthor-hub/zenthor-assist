# Convex Backend Notes

This directory contains the Convex backend for `zenthor-assist`.

## Key Files

- `schema.ts`: Data model for conversations, messages, queueing, WhatsApp runtime state, and plugin config.
- `http.ts`: HTTP router (currently Clerk webhook route at `/clerk/webhook`).
- `crons.ts`: Scheduled jobs (stale queue requeue, task processing, verification cleanup).
- `auth.config.ts`: Convex auth provider config for Clerk.
- `clerk/`: Webhook handling and user sync logic.

Core function modules:

- `messages.ts`: User/assistant/system message writes + streaming placeholder lifecycle.
- `agent.ts`: Queue claim/heartbeat/retry/complete flow and conversation context loading.
- `delivery.ts`: Outbound queue claim/complete/fail flow (WhatsApp egress path).
- `toolApprovals.ts`: Approval requests and resolution state.
- `plugins.ts`: Plugin definitions/installs/policy APIs.

## Local Development

From `apps/backend`:

```bash
# First-time setup
bun run dev:setup

# Normal dev
bun run dev
```

## Environment Variables (Convex Dashboard)

- `CLERK_JWT_ISSUER_DOMAIN`
- `CLERK_WEBHOOK_SECRET`
- `CLERK_SECRET_KEY`

## Important Safety Rules

- Do not edit files in `./_generated/` manually.
- Keep schema and function validators aligned when changing table shapes.
- Use explicit status transitions for queue/delivery state changes (`pending`, `processing`, `completed`/`failed`, etc.).

## Validation Tips

From `apps/backend`:

```bash
bun run lint
bun run format:check
bun run typecheck
```
