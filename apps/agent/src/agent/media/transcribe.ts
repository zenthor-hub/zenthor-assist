import { env } from "@zenthor-assist/env/agent";

import { logger } from "../../observability/logger";

const TRANSCRIBE_TIMEOUT_MS = 60_000;

/**
 * Transcribe audio using Groq's Whisper endpoint (OpenAI-compatible).
 * Returns the transcription text.
 */
export async function transcribeAudio(opts: {
  buffer: Buffer;
  mimetype: string;
  fileName: string;
}): Promise<string> {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured");
  }

  const form = new FormData();
  const blob = new Blob([new Uint8Array(opts.buffer)], {
    type: opts.mimetype || "application/octet-stream",
  });
  form.append("file", blob, opts.fileName);
  form.append("model", "whisper-large-v3");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Transcription failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { text?: unknown };

  if (typeof data.text !== "string" || data.text.length === 0) {
    throw new Error(
      `Transcription returned invalid payload: expected non-empty text, got ${typeof data.text}`,
    );
  }

  void logger.info("agent.media.transcribed", {
    fileName: opts.fileName,
    transcriptLength: data.text.length,
  });

  return data.text;
}
