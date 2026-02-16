import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@zenthor-assist/env/agent", () => ({
  env: {
    TELEGRAM_BOT_TOKEN: "123456:ABCDEF",
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

import { deleteMessage, editMessage, sendMessage, sendTypingIndicator } from "./sender";

const fetchSpy = vi.fn();

beforeEach(() => {
  globalThis.fetch = fetchSpy;
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("telegram sender", () => {
  it("sends text to normalized tg chat id and returns message id", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, result: { message_id: 111 } }),
    });

    const messageId = await sendMessage("tg:12345", "  hello telegram  ");

    expect(messageId).toBe(111);
    const [url, options] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bot123456:ABCDEF/sendMessage");

    const body = JSON.parse(options.body);
    expect(body).toEqual({
      chat_id: "12345",
      text: "hello telegram",
      parse_mode: "MarkdownV2",
    });
  });

  it("sends text to normalized telegram: chat id", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, result: { message_id: 222 } }),
    });

    await sendMessage("telegram:-998", "ok");

    const [, options] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe("-998");
  });

  it("sends typing indicator", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, result: true }),
    });

    await sendTypingIndicator("tg:9876");

    const [, options] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(options.body);
    expect(body).toEqual({ chat_id: "9876", action: "typing" });
  });

  it("edits and deletes messages", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    });

    await editMessage("tg:1", 55, "updated");
    await deleteMessage("telegram:2", 56);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const editBody = JSON.parse(fetchSpy.mock.calls[0]![1]!.body);
    const deleteBody = JSON.parse(fetchSpy.mock.calls[1]![1]!.body);

    expect(editBody).toMatchObject({ chat_id: "1", message_id: 55, text: "updated" });
    expect(deleteBody).toMatchObject({ chat_id: "2", message_id: 56 });
  });

  it("throws when bot token is missing", async () => {
    const envMod = await import("@zenthor-assist/env/agent");
    const original = envMod.env.TELEGRAM_BOT_TOKEN;
    (envMod.env as Record<string, unknown>).TELEGRAM_BOT_TOKEN = undefined;

    await expect(sendMessage("tg:1", "x")).rejects.toThrow("TELEGRAM_BOT_TOKEN is required");

    (envMod.env as Record<string, unknown>).TELEGRAM_BOT_TOKEN = original;
  });

  it("throws when API request fails", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ description: "chat not found" }),
    });

    await expect(sendMessage("tg:2", "x")).rejects.toThrow(
      "Telegram API error (sendMessage): chat not found",
    );
  });
});
