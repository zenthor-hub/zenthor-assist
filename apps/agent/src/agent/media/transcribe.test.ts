import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@zenthor-assist/env/agent", () => ({
  env: {
    GROQ_API_KEY: "test-groq-key",
  },
}));

vi.mock("../../observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

import { transcribeAudio } from "./transcribe";

const fetchSpy = vi.fn();

beforeEach(() => {
  globalThis.fetch = fetchSpy;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const DEFAULT_OPTS = {
  buffer: Buffer.from("fake-audio"),
  mimetype: "audio/ogg",
  fileName: "test.ogg",
};

describe("transcribeAudio", () => {
  it("returns transcript on valid provider response", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ text: "Hello world" }),
    });

    const result = await transcribeAudio(DEFAULT_OPTS);

    expect(result).toBe("Hello world");
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [url, opts] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer test-groq-key");
  });

  it("throws on non-2xx response", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    });

    await expect(transcribeAudio(DEFAULT_OPTS)).rejects.toThrow(
      "Transcription failed: 429 Rate limited",
    );
  });

  it("throws when provider returns missing text field", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await expect(transcribeAudio(DEFAULT_OPTS)).rejects.toThrow(
      "Transcription returned invalid payload: expected non-empty text, got undefined",
    );
  });

  it("throws when provider returns empty text", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ text: "" }),
    });

    await expect(transcribeAudio(DEFAULT_OPTS)).rejects.toThrow(
      "Transcription returned invalid payload: expected non-empty text, got string",
    );
  });

  it("throws when provider returns non-string text", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ text: 42 }),
    });

    await expect(transcribeAudio(DEFAULT_OPTS)).rejects.toThrow(
      "Transcription returned invalid payload: expected non-empty text, got number",
    );
  });

  it("throws when GROQ_API_KEY is not configured", async () => {
    const envMod = await import("@zenthor-assist/env/agent");
    const original = envMod.env.GROQ_API_KEY;
    (envMod.env as Record<string, unknown>).GROQ_API_KEY = undefined;

    await expect(transcribeAudio(DEFAULT_OPTS)).rejects.toThrow("GROQ_API_KEY not configured");

    (envMod.env as Record<string, unknown>).GROQ_API_KEY = original;
  });
});
