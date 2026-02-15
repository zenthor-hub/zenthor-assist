import { env } from "@zenthor-assist/env/agent";

import { logger, typedEvent } from "../observability/logger";

const GRAPH_API_VERSION = "v24.0";
const SEND_TIMEOUT_MS = 30_000;

interface CloudApiResponse {
  messages?: Array<{ id: string }>;
  error?: { message: string; code: number; type: string };
}

interface QuickReplyButton {
  id: string;
  title: string;
}

function buildWhatsappCloudConfig() {
  const accessToken = env.WHATSAPP_CLOUD_ACCESS_TOKEN;
  const phoneNumberId = env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new Error("WHATSAPP_CLOUD_ACCESS_TOKEN and WHATSAPP_CLOUD_PHONE_NUMBER_ID are required");
  }

  return {
    accessToken,
    url: `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
  };
}

/**
 * Send a text message via WhatsApp Cloud API (Graph API).
 * Returns the wamid from the response.
 */
export async function sendCloudApiMessage(phone: string, text: string): Promise<string> {
  const { accessToken, url } = buildWhatsappCloudConfig();

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

/**
 * Send an image message via WhatsApp Cloud API (Graph API).
 * `imageUrl` must be publicly accessible.
 */
export async function sendCloudApiImage(
  phone: string,
  imageUrl: string,
  caption?: string,
): Promise<string> {
  const { accessToken, url } = buildWhatsappCloudConfig();
  const normalizedCaption = caption?.trim();

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
      type: "image",
      image: {
        link: imageUrl,
        ...(normalizedCaption ? { caption: normalizedCaption.slice(0, 1024) } : {}),
      },
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
    void logger.lineError(`[whatsapp-cloud] Image send failed to ${phone}: ${errorMsg}`);
    typedEvent.error("whatsapp.cloud.send.failed", {
      phone,
      error: errorMsg,
      statusCode: response.status,
    });
    throw new Error(`WhatsApp Cloud API image error: ${errorMsg}`);
  }

  const wamid = data.messages?.[0]?.id ?? "unknown";
  void logger.lineInfo(`[whatsapp-cloud] Sent image to ${phone} (wamid: ${wamid})`);
  typedEvent.info("whatsapp.cloud.send.success", {
    phone,
    wamid,
    messageLength: caption?.length ?? 0,
  });

  return wamid;
}

/**
 * Send a WhatsApp interactive quick-reply button message.
 * WhatsApp supports up to 3 reply buttons.
 */
export async function sendCloudApiQuickReplyButtons(
  phone: string,
  text: string,
  buttons: QuickReplyButton[],
): Promise<string> {
  const normalizedButtons = buttons
    .map((button) => ({
      id: button.id.trim().slice(0, 256),
      title: button.title.trim().slice(0, 20),
    }))
    .filter((button) => button.id.length > 0 && button.title.length > 0)
    .slice(0, 3);

  if (normalizedButtons.length === 0) {
    return await sendCloudApiMessage(phone, text);
  }

  const { accessToken, url } = buildWhatsappCloudConfig();
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
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: {
          buttons: normalizedButtons.map((button) => ({
            type: "reply",
            reply: {
              id: button.id,
              title: button.title,
            },
          })),
        },
      },
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
    void logger.lineError(`[whatsapp-cloud] Button send failed to ${phone}: ${errorMsg}`);
    typedEvent.error("whatsapp.cloud.send.failed", {
      phone,
      error: errorMsg,
      statusCode: response.status,
    });
    throw new Error(`WhatsApp Cloud API button error: ${errorMsg}`);
  }

  const wamid = data.messages?.[0]?.id ?? "unknown";
  void logger.lineInfo(`[whatsapp-cloud] Sent button message to ${phone} (wamid: ${wamid})`);
  typedEvent.info("whatsapp.cloud.send.success", {
    phone,
    wamid,
    messageLength: text.length,
  });

  return wamid;
}

/**
 * Send a typing indicator ("typing...") to a WhatsApp user via Cloud API.
 * Non-critical — failures are logged but never thrown.
 */
export async function sendTypingIndicator(phone: string): Promise<void> {
  const { accessToken, url } = buildWhatsappCloudConfig();

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
      typing_indicator: { type: "text" },
    }),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    const rawBody = await response.text().catch(() => "");
    throw new Error(`Typing indicator failed: HTTP ${response.status} — ${rawBody.slice(0, 200)}`);
  }

  void logger.lineInfo(`[whatsapp-cloud] Typing indicator sent to ${phone}`);
}
