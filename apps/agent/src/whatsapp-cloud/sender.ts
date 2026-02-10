import { env } from "@zenthor-assist/env/agent";

import { logger, typedEvent } from "../observability/logger";

const GRAPH_API_VERSION = "v24.0";
const SEND_TIMEOUT_MS = 30_000;

interface CloudApiResponse {
  messages?: Array<{ id: string }>;
  error?: { message: string; code: number; type: string };
}

/**
 * Send a text message via WhatsApp Cloud API (Graph API).
 * Returns the wamid from the response.
 */
export async function sendCloudApiMessage(phone: string, text: string): Promise<string> {
  const accessToken = env.WHATSAPP_CLOUD_ACCESS_TOKEN;
  const phoneNumberId = env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new Error("WHATSAPP_CLOUD_ACCESS_TOKEN and WHATSAPP_CLOUD_PHONE_NUMBER_ID are required");
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "text",
      text: { body: text },
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  const rawBody = await response.text();
  let data: CloudApiResponse = {};
  if (rawBody) {
    try {
      data = JSON.parse(rawBody) as CloudApiResponse;
    } catch {
      data = {};
    }
  }

  if (!response.ok || data.error) {
    const errorMsg = data.error?.message ?? `HTTP ${response.status}`;
    void logger.lineError(`[whatsapp-cloud] Send failed to ${phone}: ${errorMsg}`);
    typedEvent.error("whatsapp.cloud.send.failed", {
      phone,
      error: errorMsg,
      statusCode: response.status,
    });
    throw new Error(`WhatsApp Cloud API error: ${errorMsg}`);
  }

  const wamid = data.messages?.[0]?.id ?? "unknown";
  void logger.lineInfo(`[whatsapp-cloud] Sent message to ${phone} (wamid: ${wamid})`);
  typedEvent.info("whatsapp.cloud.send.success", {
    phone,
    wamid,
    messageLength: text.length,
  });

  return wamid;
}
