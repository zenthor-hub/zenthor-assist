// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { getSentryBaseTags, resolveSentryEnvironment } from "./sentry.shared";

const environment = resolveSentryEnvironment();

Sentry.init({
  dsn: "https://5538e70f0a694a0d2ed9582deea5de8c@o4510796856819712.ingest.us.sentry.io/4510845554262016",
  environment,
  initialScope: {
    tags: getSentryBaseTags(),
  },

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
