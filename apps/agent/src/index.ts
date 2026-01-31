import { startAgentLoop } from "./agent/loop";
import { startWhatsApp } from "./whatsapp/connection";

async function main() {
  console.info("[main] Starting gbarros-assistant agent...");

  const requiredEnv = ["CONVEX_URL", "AI_GATEWAY_API_KEY"];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      console.error(`[main] Missing required env var: ${key}`);
      process.exit(1);
    }
  }

  startAgentLoop();

  const enableWhatsApp = process.env["ENABLE_WHATSAPP"] !== "false";
  if (enableWhatsApp) {
    try {
      await startWhatsApp();
    } catch (error) {
      console.error("[main] Failed to start WhatsApp:", error);
      console.info("[main] Agent will continue without WhatsApp");
    }
  } else {
    console.info("[main] WhatsApp disabled via ENABLE_WHATSAPP=false");
  }

  console.info("[main] Agent is running");
}

main().catch((error) => {
  console.error("[main] Fatal error:", error);
  process.exit(1);
});
