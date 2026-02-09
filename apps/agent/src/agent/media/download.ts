import { env } from "@zenthor-assist/env/agent";

import { logger } from "../../observability/logger";

const GRAPH_API_VERSION = "v24.0";
const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Download media from Meta's WhatsApp Cloud API.
 * Two-step process:
 * 1. GET media metadata (returns a download URL)
 * 2. GET the actual binary from that URL
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
): Promise<{ buffer: Buffer; mimetype: string }> {
  const accessToken = env.WHATSAPP_CLOUD_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("WHATSAPP_CLOUD_ACCESS_TOKEN not configured");
  }

  // Step 1: Get media URL from Graph API
  const metaUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });

  if (!metaRes.ok) {
    const text = await metaRes.text().catch(() => "");
    throw new Error(`Failed to get media metadata: ${metaRes.status} ${text}`);
  }

  const meta = (await metaRes.json()) as {
    url: string;
    mime_type?: string;
  };

  if (!meta.url) {
    throw new Error("Media metadata missing download URL");
  }

  // Step 2: Download binary from the URL
  const downloadRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });

  if (!downloadRes.ok) {
    const text = await downloadRes.text().catch(() => "");
    throw new Error(`Failed to download media: ${downloadRes.status} ${text}`);
  }

  const arrayBuffer = await downloadRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  void logger.info("agent.media.downloaded", {
    mediaId,
    mimetype: meta.mime_type,
    sizeBytes: buffer.length,
  });

  return {
    buffer,
    mimetype: meta.mime_type ?? "audio/ogg",
  };
}
