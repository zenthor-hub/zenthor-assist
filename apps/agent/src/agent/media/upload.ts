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
  "audio/wav": "wav",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
};

function mimeToExtension(mimetype: string): string {
  const direct = MIME_TO_EXT[mimetype];
  if (direct) return direct;

  const normalized = mimetype.trim().toLowerCase();
  if (normalized.includes("/")) {
    const ext = normalized
      .split("/")
      .at(-1)
      ?.replace(/[^a-z0-9.+-]/g, "");
    if (ext) return ext;
  }

  return "bin";
}

type MediaCategory = "audio" | "image" | "video" | "document";

function sanitizeMediaCategory(category: MediaCategory | undefined): string {
  return category ?? "audio";
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
  category?: MediaCategory;
}): Promise<string> {
  const token = env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN not configured");
  }

  const ext = mimeToExtension(opts.mimetype);
  const mediaCategory = sanitizeMediaCategory(opts.category);
  const pathname = `whatsapp/${mediaCategory}/${opts.conversationId}/${opts.messageId}.${ext}`;

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
