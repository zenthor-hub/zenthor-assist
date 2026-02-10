import { logger } from "../observability/logger";
import { downloadWhatsAppMedia, transcribeAudio, uploadMediaToBlob } from "./media";

/** Result of processing a single audio trigger message. */
interface AudioProcessingResult {
  /** Map of messageId → transcript text for successfully transcribed messages. */
  transcripts: Map<string, string>;
  /** Set of messageIds where transcription failed (trigger audio that should get fallback text). */
  failed: Set<string>;
  /** Blob URL if upload succeeded (undefined otherwise). */
  blobUrl?: string;
}

export interface AudioTriggerMessage {
  _id: string;
  media: {
    type: string;
    sourceId: string;
    mimetype: string;
    transcript?: string;
  };
}

/**
 * Download, transcribe, and upload audio for a trigger message.
 * Transcription and upload are independent — transcript is preserved even if upload fails.
 */
export async function processAudioTrigger(
  triggerMsg: AudioTriggerMessage,
  conversationId: string,
): Promise<AudioProcessingResult> {
  const transcripts = new Map<string, string>();
  const failed = new Set<string>();
  let blobUrl: string | undefined;

  try {
    const { buffer } = await downloadWhatsAppMedia(triggerMsg.media.sourceId);

    const [transcribeResult, uploadResult] = await Promise.allSettled([
      transcribeAudio({
        buffer,
        mimetype: triggerMsg.media.mimetype,
        fileName: `${triggerMsg._id}.ogg`,
      }),
      uploadMediaToBlob({
        buffer,
        conversationId,
        messageId: triggerMsg._id,
        mimetype: triggerMsg.media.mimetype,
      }),
    ]);

    if (transcribeResult.status === "fulfilled") {
      transcripts.set(triggerMsg._id, transcribeResult.value);
    } else {
      failed.add(triggerMsg._id);
      void logger.warn("agent.media.transcribe_failed", {
        messageId: triggerMsg._id,
        error:
          transcribeResult.reason instanceof Error
            ? transcribeResult.reason.message
            : String(transcribeResult.reason),
      });
    }

    if (uploadResult.status === "fulfilled") {
      blobUrl = uploadResult.value;
    } else {
      void logger.warn("agent.media.upload_failed", {
        messageId: triggerMsg._id,
        error:
          uploadResult.reason instanceof Error
            ? uploadResult.reason.message
            : String(uploadResult.reason),
      });
    }
  } catch (error) {
    failed.add(triggerMsg._id);
    void logger.warn("agent.media.processing_failed", {
      messageId: triggerMsg._id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { transcripts, failed, blobUrl };
}

const AUDIO_FALLBACK_CONTENT = "[Voice message could not be transcribed]";

/** Message shape expected by the audio message builder. */
interface RawConversationMessage {
  _id: string;
  role: string;
  content: string;
  media?: {
    type: string;
    sourceId: string;
    mimetype: string;
    transcript?: string;
  };
}

/**
 * Build the conversation message array for the LLM, applying audio transcript
 * substitution and filtering untranscribed audio from history.
 */
export function buildConversationMessages(
  messages: RawConversationMessage[],
  audioResult: AudioProcessingResult,
): { role: "user" | "assistant" | "system"; content: string }[] {
  return messages
    .filter((m) => {
      if (m.role !== "user" && m.role !== "assistant" && m.role !== "system") return false;
      if (m.media?.type === "audio" && !m.media.transcript && !audioResult.transcripts.has(m._id)) {
        if (audioResult.failed.has(m._id)) return true; // keep with fallback content
        return false;
      }
      return true;
    })
    .map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: audioResult.failed.has(m._id)
        ? AUDIO_FALLBACK_CONTENT
        : (audioResult.transcripts.get(m._id) ?? m.media?.transcript ?? m.content),
    }));
}
