import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (must be before imports) ---

const mockDownload = vi.fn();
const mockTranscribe = vi.fn();
const mockUpload = vi.fn();

vi.mock("./media", () => ({
  downloadWhatsAppMedia: (...args: unknown[]) => mockDownload(...args),
  transcribeAudio: (...args: unknown[]) => mockTranscribe(...args),
  uploadMediaToBlob: (...args: unknown[]) => mockUpload(...args),
}));

vi.mock("../observability/logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import {
  AUDIO_FALLBACK_CONTENT,
  buildConversationMessages,
  processAudioTrigger,
} from "./audio-processing";
import type {
  AudioProcessingResult,
  AudioTriggerMessage,
  RawConversationMessage,
} from "./audio-processing";

const TRIGGER: AudioTriggerMessage = {
  _id: "msg_trigger",
  media: {
    type: "audio",
    sourceId: "media-123",
    mimetype: "audio/ogg",
  },
};

const CONVERSATION_ID = "conv_test";

beforeEach(() => {
  mockDownload.mockReset();
  mockTranscribe.mockReset();
  mockUpload.mockReset();
});

// ─── processAudioTrigger ───

describe("processAudioTrigger", () => {
  it("returns transcript and blobUrl when both succeed", async () => {
    mockDownload.mockResolvedValue({ buffer: Buffer.from("audio"), mimetype: "audio/ogg" });
    mockTranscribe.mockResolvedValue("Hello world");
    mockUpload.mockResolvedValue("https://blob.test/audio.ogg");

    const result = await processAudioTrigger(TRIGGER, CONVERSATION_ID);

    expect(result.transcripts.get("msg_trigger")).toBe("Hello world");
    expect(result.failed.size).toBe(0);
    expect(result.blobUrl).toBe("https://blob.test/audio.ogg");
  });

  it("keeps transcript when upload fails", async () => {
    mockDownload.mockResolvedValue({ buffer: Buffer.from("audio"), mimetype: "audio/ogg" });
    mockTranscribe.mockResolvedValue("Transcript text");
    mockUpload.mockRejectedValue(new Error("BLOB_READ_WRITE_TOKEN not configured"));

    const result = await processAudioTrigger(TRIGGER, CONVERSATION_ID);

    expect(result.transcripts.get("msg_trigger")).toBe("Transcript text");
    expect(result.failed.size).toBe(0);
    expect(result.blobUrl).toBeUndefined();
  });

  it("marks failed when transcription fails but upload succeeds", async () => {
    mockDownload.mockResolvedValue({ buffer: Buffer.from("audio"), mimetype: "audio/ogg" });
    mockTranscribe.mockRejectedValue(new Error("GROQ_API_KEY not configured"));
    mockUpload.mockResolvedValue("https://blob.test/audio.ogg");

    const result = await processAudioTrigger(TRIGGER, CONVERSATION_ID);

    expect(result.transcripts.size).toBe(0);
    expect(result.failed.has("msg_trigger")).toBe(true);
    expect(result.blobUrl).toBe("https://blob.test/audio.ogg");
  });

  it("marks failed when both transcription and upload fail", async () => {
    mockDownload.mockResolvedValue({ buffer: Buffer.from("audio"), mimetype: "audio/ogg" });
    mockTranscribe.mockRejectedValue(new Error("transcription error"));
    mockUpload.mockRejectedValue(new Error("upload error"));

    const result = await processAudioTrigger(TRIGGER, CONVERSATION_ID);

    expect(result.transcripts.size).toBe(0);
    expect(result.failed.has("msg_trigger")).toBe(true);
  });

  it("marks failed when download itself fails", async () => {
    mockDownload.mockRejectedValue(new Error("WHATSAPP_CLOUD_ACCESS_TOKEN not configured"));

    const result = await processAudioTrigger(TRIGGER, CONVERSATION_ID);

    expect(result.transcripts.size).toBe(0);
    expect(result.failed.has("msg_trigger")).toBe(true);
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

// ─── buildConversationMessages ───

describe("buildConversationMessages", () => {
  const emptyResult: AudioProcessingResult = {
    transcripts: new Map(),
    failed: new Set(),
  };

  it("passes through text messages unchanged", () => {
    const msgs: RawConversationMessage[] = [
      { _id: "m1", role: "user", content: "Hello" },
      { _id: "m2", role: "assistant", content: "Hi there" },
    ];

    const result = buildConversationMessages(msgs, emptyResult);

    expect(result).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]);
  });

  it("substitutes transcript for successfully transcribed audio", () => {
    const transcripts = new Map([["m1", "Transcribed voice note"]]);
    const msgs: RawConversationMessage[] = [
      {
        _id: "m1",
        role: "user",
        content: "[Audio message]",
        media: { type: "audio", sourceId: "s1", mimetype: "audio/ogg" },
      },
    ];

    const result = buildConversationMessages(msgs, {
      transcripts,
      failed: new Set(),
    });

    expect(result).toEqual([{ role: "user", content: "Transcribed voice note" }]);
  });

  it("uses media.transcript for previously transcribed audio", () => {
    const msgs: RawConversationMessage[] = [
      {
        _id: "m1",
        role: "user",
        content: "Old transcript",
        media: {
          type: "audio",
          sourceId: "s1",
          mimetype: "audio/ogg",
          transcript: "Old transcript",
        },
      },
    ];

    const result = buildConversationMessages(msgs, emptyResult);

    expect(result).toEqual([{ role: "user", content: "Old transcript" }]);
  });

  it("drops historical untranscribed audio (not trigger)", () => {
    const msgs: RawConversationMessage[] = [
      {
        _id: "m1",
        role: "user",
        content: "[Audio message]",
        media: { type: "audio", sourceId: "s1", mimetype: "audio/ogg" },
      },
      { _id: "m2", role: "user", content: "Text message" },
    ];

    const result = buildConversationMessages(msgs, emptyResult);

    expect(result).toEqual([{ role: "user", content: "Text message" }]);
  });

  it("keeps failed trigger audio with fallback content", () => {
    const msgs: RawConversationMessage[] = [
      {
        _id: "m1",
        role: "user",
        content: "[Audio message]",
        media: { type: "audio", sourceId: "s1", mimetype: "audio/ogg" },
      },
    ];

    const result = buildConversationMessages(msgs, {
      transcripts: new Map(),
      failed: new Set(["m1"]),
    });

    expect(result).toEqual([{ role: "user", content: AUDIO_FALLBACK_CONTENT }]);
  });

  it("filters non-user/assistant/system roles", () => {
    const msgs: RawConversationMessage[] = [
      { _id: "m1", role: "tool", content: "tool output" },
      { _id: "m2", role: "user", content: "Hello" },
    ];

    const result = buildConversationMessages(msgs, emptyResult);

    expect(result).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("handles mixed conversation with audio, text, and history", () => {
    const transcripts = new Map([["m3", "Voice transcript"]]);
    const msgs: RawConversationMessage[] = [
      {
        _id: "m1",
        role: "user",
        content: "prev text",
        media: {
          type: "audio",
          sourceId: "s0",
          mimetype: "audio/ogg",
          transcript: "previous voice",
        },
      },
      { _id: "m2", role: "assistant", content: "reply" },
      {
        _id: "m3",
        role: "user",
        content: "[Audio message]",
        media: { type: "audio", sourceId: "s1", mimetype: "audio/ogg" },
      },
    ];

    const result = buildConversationMessages(msgs, {
      transcripts,
      failed: new Set(),
    });

    expect(result).toEqual([
      { role: "user", content: "previous voice" },
      { role: "assistant", content: "reply" },
      { role: "user", content: "Voice transcript" },
    ]);
  });
});
