import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";

/**
 * Verify HMAC-SHA256 signature from Meta webhook payloads.
 * Uses the app secret as the HMAC key.
 * Exported for testing.
 */
export async function verifySignature(
  body: string,
  signature: string,
  appSecret: string,
): Promise<boolean> {
  const expected = signature.replace("sha256=", "");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === expected;
}

/**
 * GET /whatsapp-cloud/webhook — Meta verification challenge.
 * Meta sends hub.mode, hub.verify_token, and hub.challenge as query params.
 */
export const verify = httpAction(async (_ctx, request) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_CLOUD_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error("[whatsapp-cloud] WHATSAPP_CLOUD_VERIFY_TOKEN not set");
    return new Response("Server configuration error", { status: 500 });
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.info("[whatsapp-cloud] Webhook verification succeeded");
    return new Response(challenge ?? "", { status: 200 });
  }

  console.warn("[whatsapp-cloud] Webhook verification failed", { mode });
  return new Response("Forbidden", { status: 403 });
});

/**
 * POST /whatsapp-cloud/webhook — Incoming messages + status updates from Meta.
 * Must return HTTP 200 within 20 seconds to avoid retries.
 */
export const incoming = httpAction(async (ctx, request) => {
  const appSecret = process.env.WHATSAPP_CLOUD_APP_SECRET;
  if (!appSecret) {
    console.error("[whatsapp-cloud] WHATSAPP_CLOUD_APP_SECRET not set");
    return new Response("OK", { status: 200 });
  }

  const body = await request.text();

  // Verify signature
  const signature = request.headers.get("X-Hub-Signature-256");
  if (!signature) {
    console.warn("[whatsapp-cloud] Missing X-Hub-Signature-256 header");
    return new Response("OK", { status: 200 });
  }

  const valid = await verifySignature(body, signature, appSecret);
  if (!valid) {
    console.warn("[whatsapp-cloud] Invalid webhook signature");
    return new Response("OK", { status: 200 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(body) as WebhookPayload;
  } catch {
    console.error("[whatsapp-cloud] Failed to parse webhook body");
    return new Response("OK", { status: 200 });
  }

  // Validate payload object type
  if (payload.object !== "whatsapp_business_account") {
    console.warn("[whatsapp-cloud] Ignoring webhook with unexpected object type", {
      object: payload.object,
    });
    return new Response("OK", { status: 200 });
  }

  // Optional phone_number_id scope: reject traffic for other numbers
  const expectedPhoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;

  // Collect mutation promises so we can fire them concurrently per change
  const mutations: Promise<unknown>[] = [];

  // Process each entry/change
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      if (!value) continue;

      // Scope by phone_number_id when configured
      if (
        expectedPhoneNumberId &&
        value.metadata?.phone_number_id &&
        value.metadata.phone_number_id !== expectedPhoneNumberId
      ) {
        console.info("[whatsapp-cloud] Ignoring webhook for different phone_number_id", {
          received: value.metadata.phone_number_id,
          expected: expectedPhoneNumberId,
        });
        continue;
      }

      // Handle incoming messages
      for (const message of value.messages ?? []) {
        const from = message.from;
        const messageId = message.id;
        const timestamp = Number(message.timestamp) * 1000;

        // Handle text messages
        if (message.type === "text" && message.text?.body) {
          mutations.push(
            ctx.runMutation(internal.whatsappCloud.mutations.handleIncoming, {
              from,
              messageId,
              text: message.text.body,
              timestamp,
              messageType: message.type,
            }),
          );
          continue;
        }

        // Handle audio messages (voice notes)
        if (message.type === "audio" && message.audio?.id) {
          mutations.push(
            ctx.runMutation(internal.whatsappCloud.mutations.handleIncomingMedia, {
              from,
              messageId,
              timestamp,
              messageType: "audio",
              mediaId: message.audio.id,
              mimetype: message.audio.mime_type ?? "audio/ogg",
            }),
          );
          continue;
        }
      }

      // Handle status updates
      for (const status of value.statuses ?? []) {
        mutations.push(
          ctx.runMutation(internal.whatsappCloud.mutations.handleStatus, {
            messageId: status.id,
            status: status.status,
            recipientId: status.recipient_id,
            timestamp: Number(status.timestamp) * 1000,
            errors: status.errors?.map((e: WebhookStatusError) => e.title) ?? [],
          }),
        );
      }
    }
  }

  // Fire all mutations concurrently for faster 200 ACK
  if (mutations.length > 0) {
    await Promise.all(mutations).catch((error) => {
      console.error("[whatsapp-cloud] Mutation batch error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return new Response("OK", { status: 200 });
});

// ── Webhook payload types ──

interface WebhookPayload {
  object?: string;
  entry?: WebhookEntry[];
}

interface WebhookEntry {
  id?: string;
  changes?: WebhookChange[];
}

interface WebhookChange {
  field?: string;
  value?: WebhookValue;
}

interface WebhookValue {
  messaging_product?: string;
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  messages?: WebhookMessage[];
  statuses?: WebhookStatus[];
}

interface WebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  audio?: { id: string; mime_type: string };
}

interface WebhookStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  errors?: WebhookStatusError[];
}

interface WebhookStatusError {
  code: number;
  title: string;
}
