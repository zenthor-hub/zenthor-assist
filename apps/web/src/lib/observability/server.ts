import "server-only";
import { env } from "@zenthor-assist/env/web";
import { createLogger, getDefaultRuntimeContext } from "@zenthor-assist/observability";

const runtimeContext = getDefaultRuntimeContext();

export const webLogger = createLogger({
  service: "web",
  enabled: env.OBS_ENABLED,
  token: env.AXIOM_TOKEN,
  dataset: env.AXIOM_DATASET,
  sampleRate: env.OBS_SAMPLE_RATE,
  logLevel: env.OBS_LOG_LEVEL,
  includeContent: env.OBS_INCLUDE_CONTENT,
  environment: runtimeContext.env,
  release: runtimeContext.release,
  staticFields: {
    runtime: "next",
  },
});
