import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@zenthor-assist/env/agent", () => ({
  env: {
    WHATSAPP_CLOUD_ACCESS_TOKEN: "test-token",
  },
}));

vi.mock("../../observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

import { downloadWhatsAppMedia } from "./download";

const fetchSpy = vi.fn();

beforeEach(() => {
  globalThis.fetch = fetchSpy;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadWhatsAppMedia", () => {
  it("downloads metadata then binary, returning buffer and mimetype", async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: "https://media.fb.com/download/abc",
          mime_type: "audio/ogg",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        headers: new Headers({ "content-type": "audio/ogg; codecs=opus" }),
      });

    const result = await downloadWhatsAppMedia("media-123");

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBe(3);
    expect(result.mimetype).toBe("audio/ogg");

    // Verify metadata request
    const [metaUrl, metaOpts] = fetchSpy.mock.calls[0]!;
    expect(metaUrl).toContain("media-123");
    expect(metaOpts.headers.Authorization).toBe("Bearer test-token");

    // Verify binary download request
    const [dlUrl] = fetchSpy.mock.calls[1]!;
    expect(dlUrl).toBe("https://media.fb.com/download/abc");
  });

  it("falls back to content-type header when metadata has no mime_type", async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://media.fb.com/download/abc" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1]).buffer,
        headers: new Headers({ "content-type": "audio/mpeg" }),
      });

    const result = await downloadWhatsAppMedia("media-456");

    expect(result.mimetype).toBe("audio/mpeg");
  });

  it("defaults to audio/ogg when no mimetype available anywhere", async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://media.fb.com/download/abc" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1]).buffer,
        headers: new Headers(),
      });

    const result = await downloadWhatsAppMedia("media-789");

    expect(result.mimetype).toBe("audio/ogg");
  });

  it("throws on metadata fetch non-2xx", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not found",
    });

    await expect(downloadWhatsAppMedia("bad-id")).rejects.toThrow(
      "Failed to get media metadata: 404 Not found",
    );
  });

  it("throws when metadata has no download URL", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await expect(downloadWhatsAppMedia("no-url")).rejects.toThrow(
      "Media metadata missing download URL",
    );
  });

  it("throws on binary download non-2xx", async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://media.fb.com/download/abc" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Server error",
      });

    await expect(downloadWhatsAppMedia("media-fail")).rejects.toThrow(
      "Failed to download media: 500 Server error",
    );
  });

  it("throws when access token is not configured", async () => {
    const envMod = await import("@zenthor-assist/env/agent");
    const original = envMod.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
    (envMod.env as Record<string, unknown>).WHATSAPP_CLOUD_ACCESS_TOKEN = undefined;

    await expect(downloadWhatsAppMedia("media-any")).rejects.toThrow(
      "WHATSAPP_CLOUD_ACCESS_TOKEN not configured",
    );

    (envMod.env as Record<string, unknown>).WHATSAPP_CLOUD_ACCESS_TOKEN = original;
  });
});
