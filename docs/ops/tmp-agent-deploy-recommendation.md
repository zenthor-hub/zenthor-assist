# apps/agent Deployment Recommendation

Yes, you can deploy `apps/agent` on **Railway**, and it’s a good fit for your current architecture.

## Recommended setup

1. **Service 1:** `agent-core` (`AGENT_ROLE=core`, `ENABLE_WHATSAPP=false`)
2. **Service 2:** `agent-whatsapp-cloud` (`AGENT_ROLE=whatsapp-cloud`, replicas = 1 per WhatsApp Cloud account)
3. If still using local WhatsApp auth files, mount a Railway **Volume** for `.whatsapp-auth` and keep the volume path aligned with your service working directory.

## CI/CD recommendation on Railway

1. Connect GitHub and enable **Autodeploys**
2. Enable **Wait for CI** so deploy only happens after GitHub Actions pass

## About alternatives

- **Vercel alone is not ideal** for the long-lived subscriber/worker loop (function max duration limits).
- **Cloudflare Workers** are request/CPU-limit oriented; possible for some patterns, but not the easiest first choice for always-on Bun worker processes.
- If not Railway, pick a container worker platform (Fly/Render/ECS) over serverless for this agent runtime shape.

## References

- Railway scaling/replicas: https://docs.railway.com/reference/scaling
- Railway volumes: https://docs.railway.com/reference/volumes
- Railway volume mount behavior (`/app`): https://docs.railway.com/develop/volumes
- Railway GitHub autodeploy + Wait for CI: https://docs.railway.com/guides/github-autodeploys
- Vercel function duration limits: https://vercel.com/docs/functions/limitations
- Cloudflare Workers limits (CPU/request model): https://developers.cloudflare.com/workers/platform/limits/
