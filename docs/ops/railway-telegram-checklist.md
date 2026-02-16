# Railway Environment Checklist (agent-core, agent-whatsapp-cloud, agent-telegram)

Use this checklist as a copy/paste template for the three service env var sets.

## Shared rules

- Set vars per service + environment (dev/prod).
- If a var changes on Railway, redeploy that service to pick up the new value.
- Keep `AGENT_SECRET` identical across Convex and all running services.
- Keep `CONVEX_URL` consistent with the deployment environment (dev -> dev, prod -> prod).

## `agent-core` (worker)

### Shared service values

```env
AGENT_ROLE=core
ENABLE_WHATSAPP=false
CONVEX_URL=<your-convex-url>
CONVEX_DEPLOYMENT=optional
AGENT_SECRET=<same-as-convex>
AI_GATEWAY_API_KEY=<gateway-key>
WORKER_ID=agent-core-<env>
```

### Optional/recommended

```env
AI_LITE_MODEL=<optional>
AI_MODEL=<optional>
AI_FALLBACK_MODEL=<optional>
AI_CONTEXT_WINDOW=<optional>
AI_EMBEDDING_MODEL=<optional>
GROQ_API_KEY=<optional>
BLOB_READ_WRITE_TOKEN=<optional>
AXIOM_TOKEN=<optional>
AXIOM_DATASET=<optional>
SENTRY_DSN=<optional>
SENTRY_ENABLED=<optional>
SENTRY_TRACES_SAMPLE_RATE=<optional>
```

## `agent-whatsapp-cloud` (WhatsApp egress ingress)

### Required

```env
AGENT_ROLE=whatsapp-cloud
CONVEX_URL=<your-convex-url>
AGENT_SECRET=<same-as-convex>
WHATSAPP_CLOUD_ACCESS_TOKEN=<whatsapp-cloud-access-token>
WHATSAPP_CLOUD_PHONE_NUMBER_ID=<phone-number-id>
WORKER_ID=agent-whatsapp-cloud-<env>
```

### Optional

```env
WHATSAPP_CLOUD_ACCOUNT_ID=cloud-api
WHATSAPP_CLOUD_PHONE=<phone-label>
AXIOM_TOKEN=<optional>
AXIOM_DATASET=<optional>
SENTRY_DSN=<optional>
SENTRY_ENABLED=<optional>
SENTRY_TRACES_SAMPLE_RATE=<optional>
```

## `agent-telegram` (single Telegram ingress + outbound service)

### Required

```env
AGENT_ROLE=telegram
CONVEX_URL=<your-convex-url>
AGENT_SECRET=<same-as-convex>
TELEGRAM_BOT_TOKEN=<telegram-bot-token>
WORKER_ID=agent-telegram-<env>
```

### Recommended

```env
TELEGRAM_ACCOUNT_ID=default
TELEGRAM_WEBHOOK_SECRET=<telegram-webhook-secret>
AXIOM_TOKEN=<optional>
AXIOM_DATASET=<optional>
SENTRY_DSN=<optional>
SENTRY_ENABLED=<optional>
SENTRY_TRACES_SAMPLE_RATE=<optional>
```

## Convex (deployment environment)

In Convex Dashboard (dev/prod), ensure:

```env
AGENT_SECRET=<same-as-agents>
TELEGRAM_WEBHOOK_SECRET=<same-as-agent-telegram>
CLERK_JWT_ISSUER_DOMAIN=<your-issuer>
CLERK_WEBHOOK_SECRET=<your-clerk-webhook-secret>
CLERK_SECRET_KEY=<your-clerk-secret>
```

## Start commands

- `agent-core`: `AGENT_ROLE=core bun run start:core`
- `agent-whatsapp-cloud`: `bun run start:whatsapp-cloud`
- `agent-telegram`: `AGENT_ROLE=telegram bun run start:telegram`

## Telegram webhook registration

1. Register Telegram webhook with:

```bash
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<convex-url>/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

2. Validate with one test request using the same secret header:

```bash
curl -X POST "<convex-url>/telegram/webhook" \
  -H "Content-Type: application/json" \
  -H "x-telegram-bot-api-secret-token: <TELEGRAM_WEBHOOK_SECRET>" \
  -d '{"message":{"message_id":100,"date":1700000000,"text":"test","chat":{"id":123456789}}}'
```
