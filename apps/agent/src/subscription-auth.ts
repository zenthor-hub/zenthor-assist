/**
 * CLI entrypoint for managing OpenAI subscription credentials.
 *
 * Usage:
 *   bun run auth:subscription login   — run OAuth flow (device or browser)
 *   bun run auth:subscription refresh  — refresh existing token
 *   bun run auth:subscription logout   — clear cached credentials
 *   bun run auth:subscription status   — show current credential state
 */

import {
  clearCredentials,
  forceLogin,
  getValidCredentials,
} from "./agent/subscription/token-manager";

const command = process.argv[2];

/* eslint-disable no-console -- CLI entrypoint, console output is intentional */

async function main() {
  switch (command) {
    case "login": {
      console.info("Starting OAuth login...");
      const creds = await forceLogin();
      console.info("Login successful!");
      console.info(`  Account ID: ${creds.accountId ?? "(not available)"}`);
      console.info(`  Expires at: ${new Date(creds.expiresAt).toISOString()}`);
      console.info("Credentials saved to Convex + .auth/openai-subscription.json");
      break;
    }

    case "refresh": {
      console.info("Refreshing credentials...");
      const creds = await getValidCredentials();
      console.info("Refresh successful!");
      console.info(`  Account ID: ${creds.accountId ?? "(not available)"}`);
      console.info(`  Expires at: ${new Date(creds.expiresAt).toISOString()}`);
      break;
    }

    case "logout": {
      await clearCredentials();
      console.info("Credentials cleared.");
      break;
    }

    case "status": {
      try {
        const creds = await getValidCredentials();
        const expiresIn = Math.round((creds.expiresAt - Date.now()) / 1000);
        console.info("Subscription credentials: VALID");
        console.info(`  Account ID: ${creds.accountId ?? "(not available)"}`);
        console.info(`  Expires in: ${expiresIn}s`);
      } catch (err) {
        console.info("Subscription credentials: NOT AVAILABLE");
        console.info(`  ${err instanceof Error ? err.message : String(err)}`);
      }
      break;
    }

    default: {
      console.info("Usage: bun run auth:subscription <login|refresh|logout|status>");
      process.exit(1);
    }
  }
}

/* eslint-enable no-console */

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
