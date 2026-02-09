import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@zenthor-assist/env/agent", () => ({
  env: {
    WHATSAPP_CLOUD_ACCESS_TOKEN: "test-token",
    WHATSAPP_CLOUD_PHONE_NUMBER_ID: "123456789",
  },
}));

vi.mock("../observability/logger", () => ({
  logger: {
    lineInfo: vi.fn(),
    lineWarn: vi.fn(),
    lineError: vi.fn(),
  },
  typedEvent: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
}));

import { sendCloudApiMessage } from "./sender";

const fetchSpy = vi.fn();

beforeEach(() => {
  globalThis.fetch = fetchSpy;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendCloudApiMessage", () => {
  it("sends a text message and returns wamid on success", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ messages: [{ id: "wamid.abc123" }] }),
    });

    const wamid = await sendCloudApiMessage("+5511999999999", "Hello");

    expect(wamid).toBe("wamid.abc123");
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [url, options] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v24.0/123456789/messages");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer test-token");
    expect(options.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(options.body);
    expect(body).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "+5511999999999",
      type: "text",
      text: { body: "Hello" },
    });
  });

  it("returns 'unknown' when response has no messages array", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
    });

    const wamid = await sendCloudApiMessage("+5511999999999", "Hello");
    expect(wamid).toBe("unknown");
  });

  it("throws on HTTP error response", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({ error: { message: "Invalid token", code: 190, type: "OAuthException" } }),
    });

    await expect(sendCloudApiMessage("+5511999999999", "Hello")).rejects.toThrow(
      "WhatsApp Cloud API error: Invalid token",
    );
  });

  it("throws on API error in response body even if status is 200", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: { message: "Invalid phone number", code: 100, type: "ApiException" },
        }),
    });

    await expect(sendCloudApiMessage("+5511999999999", "Hello")).rejects.toThrow(
      "WhatsApp Cloud API error: Invalid phone number",
    );
  });

  it("handles non-JSON error response body gracefully", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "<html>Bad Gateway</html>",
    });

    await expect(sendCloudApiMessage("+5511999999999", "Hello")).rejects.toThrow(
      "WhatsApp Cloud API error: HTTP 502",
    );
  });

  it("handles empty response body on error", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "",
    });

    await expect(sendCloudApiMessage("+5511999999999", "Hello")).rejects.toThrow(
      "WhatsApp Cloud API error: HTTP 500",
    );
  });

  it("throws when access token is missing", async () => {
    const envMod = await import("@zenthor-assist/env/agent");
    const original = envMod.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
    (envMod.env as Record<string, unknown>).WHATSAPP_CLOUD_ACCESS_TOKEN = undefined;

    await expect(sendCloudApiMessage("+5511999999999", "Hello")).rejects.toThrow(
      "WHATSAPP_CLOUD_ACCESS_TOKEN and WHATSAPP_CLOUD_PHONE_NUMBER_ID are required",
    );

    (envMod.env as Record<string, unknown>).WHATSAPP_CLOUD_ACCESS_TOKEN = original;
  });

  it("throws when phone number ID is missing", async () => {
    const envMod = await import("@zenthor-assist/env/agent");
    const original = envMod.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
    (envMod.env as Record<string, unknown>).WHATSAPP_CLOUD_PHONE_NUMBER_ID = undefined;

    await expect(sendCloudApiMessage("+5511999999999", "Hello")).rejects.toThrow(
      "WHATSAPP_CLOUD_ACCESS_TOKEN and WHATSAPP_CLOUD_PHONE_NUMBER_ID are required",
    );

    (envMod.env as Record<string, unknown>).WHATSAPP_CLOUD_PHONE_NUMBER_ID = original;
  });
});
