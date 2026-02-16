# Railway Deployments for `apps/agent` (Dev + Prod)

## Deployment Type to Choose

From the Railway "What would you like to create?" modal, choose:

- `GitHub Repository`

Reason: `apps/agent` is part of a Bun monorepo and should deploy directly from your repo.

## Target Topology

Create at least these 2 services in one Railway project, then use Railway environments so each service exists in both `production` and `development`:

1. `agent-core`
2. `agent-whatsapp-cloud`

Optionally add:

3. `agent-telegram`

This gives you these base runtime instances:

1. `agent-core` in `production`
2. `agent-whatsapp-cloud` in `production`
3. `agent-core` in `development`
4. `agent-whatsapp-cloud` in `development`

## Step-by-Step

1. Create a Railway project using `GitHub Repository` and connect this repo.
2. Keep/create a service named `agent-core`.
3. Duplicate that service (or create another from the same repo) and name it `agent-whatsapp-cloud`.
4. For both services, open `Settings` and set:
   - `Root Directory`: `/` (repo root, so Bun can resolve workspaces)
   - `Build Command`: `bun install --frozen-lockfile`
5. Set service-specific `Start Command`:
   - `agent-core`: `cd apps/agent && bun run start:core`
   - `agent-whatsapp-cloud`: `cd apps/agent && bun run start:whatsapp-cloud`
6. Create a `development` environment from Railway environments (duplicate `production` so settings are copied).
7. Set variables for each service in each environment (matrix below).
8. Deploy `development` first, validate logs and Axiom ingestion, then deploy `production`.

## Environment Variables Matrix

## Shared required config for both services

- `CONVEX_URL`
- `AGENT_SECRET` (for Convex service-key flows in production)
- `AXIOM_TOKEN` (if using Axiom transport)
- `AXIOM_DATASET` (if using Axiom transport)
- `OBS_ENABLED`
- `OBS_SAMPLE_RATE`
- `OBS_LOG_LEVEL`
- `OBS_INCLUDE_CONTENT`

## `agent-core` Variables

### Production

```env
AGENT_ROLE=core
ENABLE_WHATSAPP=false
AGENT_SECRET=<same-as-convex>

CONVEX_URL=<your-convex-prod-url>
AI_GATEWAY_API_KEY=<your-prod-key>

AXIOM_TOKEN=<your-axiom-token>
AXIOM_DATASET=zenthor-assist-agent-prod
OBS_ENABLED=true
OBS_SAMPLE_RATE=1
OBS_LOG_LEVEL=info
OBS_INCLUDE_CONTENT=false
 
```

### Development

```env
AGENT_ROLE=core
ENABLE_WHATSAPP=false
AGENT_SECRET=<same-as-convex>

CONVEX_URL=<your-convex-dev-url>
AI_GATEWAY_API_KEY=<your-dev-key>

AXIOM_TOKEN=<your-axiom-token>
AXIOM_DATASET=zenthor-assist-agent-dev
OBS_ENABLED=true
OBS_SAMPLE_RATE=1
OBS_LOG_LEVEL=info
OBS_INCLUDE_CONTENT=false
 
```

## `agent-whatsapp-cloud` Variables

### Production

```env
WORKER_ID=agent-whatsapp-cloud-prod-1

CONVEX_URL=<your-convex-prod-url>
AGENT_SECRET=<same-as-convex>
WHATSAPP_CLOUD_ACCESS_TOKEN=<whatsapp-cloud-token>
WHATSAPP_CLOUD_PHONE_NUMBER_ID=<phone-number-id>

AXIOM_TOKEN=<your-axiom-token>
AXIOM_DATASET=zenthor-assist-agent-prod
OBS_ENABLED=true
OBS_SAMPLE_RATE=1
OBS_LOG_LEVEL=info
OBS_INCLUDE_CONTENT=false

# WhatsApp Cloud runtime
WHATSAPP_CLOUD_ACCOUNT_ID=cloud-api
# Optional tuning
# WHATSAPP_LEASE_TTL_MS=45000
# WHATSAPP_HEARTBEAT_MS=15000
# WHATSAPP_CLOUD_PHONE=<phone-label>
```

### Development

```env
WORKER_ID=agent-whatsapp-cloud-dev-1

CONVEX_URL=<your-convex-dev-url>
AGENT_SECRET=<same-as-convex>
WHATSAPP_CLOUD_ACCESS_TOKEN=<whatsapp-cloud-token>
WHATSAPP_CLOUD_PHONE_NUMBER_ID=<phone-number-id>

AXIOM_TOKEN=<your-axiom-token>
AXIOM_DATASET=zenthor-assist-agent-dev
OBS_ENABLED=true
OBS_SAMPLE_RATE=1
OBS_LOG_LEVEL=info
OBS_INCLUDE_CONTENT=false

# WhatsApp Cloud runtime
WHATSAPP_CLOUD_ACCOUNT_ID=cloud-api
# Optional tuning
# WHATSAPP_LEASE_TTL_MS=45000
# WHATSAPP_HEARTBEAT_MS=15000
# WHATSAPP_CLOUD_PHONE=<phone-label>
```

## Optional Recommended Variables

- `AI_MODEL=anthropic/claude-sonnet-4-20250514`
- `AI_FALLBACK_MODEL=<fallback-model>`
- `RELEASE_SHA=<git-sha>` (helps telemetry correlation if used by your runtime context)

## Quick Validation Checklist

1. `agent-core` logs show startup with role `core`.
2. `agent-whatsapp-cloud` logs show lease acquisition and WhatsApp Cloud outbound loop startup.
3. Axiom `zenthor-assist-agent-dev` receives development events.
4. Axiom `zenthor-assist-agent-prod` receives production events.
5. In Axiom, filter by fields:
 - `app = "agent"`
 - `service` (`agent-core` or `agent-whatsapp-cloud`)
 - `deployment` / `env` (`dev` or `prod`)
 - `role` (`core` or `whatsapp-cloud`)

## References

- Railway Monorepo guide: https://docs.railway.com/guides/monorepo
- Railway Build configuration: https://docs.railway.com/guides/build-configuration
- Railway Start command: https://docs.railway.com/guides/start-command
- Railway Environments: https://docs.railway.com/reference/environments
- Railway Variables: https://docs.railway.com/guides/variables
