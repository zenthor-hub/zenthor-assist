import { put } from "@vercel/blob";
import { env } from "@zenthor-assist/env/agent";

import { logger } from "../../observability/logger";

const MIME_TO_EXT: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/opus": "opus",
};

function mimeToExtension(mimetype: string): string {
  return MIME_TO_EXT[mimetype] ?? "ogg";
}

/**
 * Upload a media buffer to Vercel Blob storage.
 * Returns the public URL of the uploaded file.
 */
export async function uploadMediaToBlob(opts: {
  buffer: Buffer;
  conversationId: string;
  messageId: string;
  mimetype: string;
}): Promise<string> {
  const token = env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN not configured");
  }

  const ext = mimeToExtension(opts.mimetype);
  const pathname = `whatsapp/audio/${opts.conversationId}/${opts.messageId}.${ext}`;

  const blob = await put(pathname, opts.buffer, {
    access: "public",
    contentType: opts.mimetype,
    addRandomSuffix: true,
    token,
  });

  void logger.info("agent.media.uploaded", {
    conversationId: opts.conversationId,
    messageId: opts.messageId,
    url: blob.url,
    sizeBytes: opts.buffer.length,
  });

  return blob.url;
}
