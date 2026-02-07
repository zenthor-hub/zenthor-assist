// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { getSentryBaseTags, resolveSentryEnvironment } from "../sentry.shared";

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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
