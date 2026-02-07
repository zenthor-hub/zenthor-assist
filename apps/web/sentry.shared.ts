export function resolveSentryEnvironment(): string {
  return (
    process.env["SENTRY_ENVIRONMENT"] ??
    process.env["NEXT_PUBLIC_SENTRY_ENVIRONMENT"] ??
    process.env["VERCEL_ENV"] ??
    process.env["NODE_ENV"] ??
    "development"
  );
}

export function getSentryBaseTags(): Record<string, string> {
  const env = resolveSentryEnvironment();

  return {
    env,
    app: "web",
    service: "web-next",
  };
}
