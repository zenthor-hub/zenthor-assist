import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleIncomingWebhook } from "./webhook";

function buildIncomingRequest(payload: object, secret: string): Request {
  return new Request("https://example.com/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: JSON.stringify(payload),
  });
}

describe("handleIncomingWebhook (telegram)", () => {
  const SECRET = "test-secret";

  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
  });

  it("returns 500 when webhook secret is not configured", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const runMutation = vi.fn();
    const ctx = { runMutation };
    const request = buildIncomingRequest({}, "whatever");

    const response = await handleIncomingWebhook(ctx, request);

    expect(response.status).toBe(500);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("returns 403 for missing/invalid webhook secret", async () => {
    const runMutation = vi.fn();
    const ctx = { runMutation };
    const request = buildIncomingRequest(
      {
        message: {
          message_id: 1,
          date: 1700000000,
          text: "hello",
          chat: { id: 123 },
        },
      },
      "wrong-secret",
    );

    const response = await handleIncomingWebhook(ctx, request);

    expect(response.status).toBe(403);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON payload", async () => {
    const runMutation = vi.fn();
    const ctx = { runMutation };
    const request = new Request("https://example.com/telegram/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-bot-api-secret-token": SECRET,
      },
      body: "{invalid-json}",
    });

    const response = await handleIncomingWebhook(ctx, request);

    expect(response.status).toBe(400);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("returns 200 for payloads without actionable messages", async () => {
    const runMutation = vi.fn();
    const ctx = { runMutation };
    const request = buildIncomingRequest({ something: "irrelevant" }, SECRET);

    const response = await handleIncomingWebhook(ctx, request);

    expect(response.status).toBe(200);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("returns 200 for messages without readable text/caption", async () => {
    const runMutation = vi.fn();
    const ctx = { runMutation };
    const request = buildIncomingRequest(
      {
        message: {
          message_id: 1001,
          date: 1700000000,
          chat: { id: 555 },
        },
      },
      SECRET,
    );

    const response = await handleIncomingWebhook(ctx, request);

    expect(response.status).toBe(200);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("calls internal mutation for text messages", async () => {
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const ctx = { runMutation };
    const request = buildIncomingRequest(
      {
        message: {
          message_id: 1002,
          date: 1700000001,
          text: "  hello telegram webhook  ",
          chat: {
            id: 555_123,
            title: "Ops Group",
          },
          from: {
            id: 999,
            first_name: "Alice",
            last_name: "Tester",
          },
        },
      },
      SECRET,
    );

    const response = await handleIncomingWebhook(ctx, request);

    expect(response.status).toBe(200);
    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), {
      chatId: "555123",
      messageId: "1002",
      text: "hello telegram webhook",
      timestamp: 1700000001 * 1000,
      messageType: "text",
      accountId: undefined,
      senderName: "Alice Tester",
      chatTitle: "Ops Group",
      senderId: "999",
    });
  });

  it("calls internal mutation for caption messages in edited channel posts", async () => {
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const ctx = { runMutation };
    const request = buildIncomingRequest(
      {
        edited_channel_post: {
          message_id: 1003,
          date: 1700000010,
          caption: "  captioned message  ",
          chat: {
            id: -2001,
            username: "channel_name",
          },
          from: {
            id: 444,
            username: "botUser",
          },
        },
      },
      SECRET,
    );

    const response = await handleIncomingWebhook(ctx, request);

    expect(response.status).toBe(200);
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), {
      chatId: "-2001",
      messageId: "1003",
      text: "captioned message",
      timestamp: 1700000010 * 1000,
      messageType: "caption",
      accountId: undefined,
      senderName: "@botUser",
      chatTitle: undefined,
      senderId: "444",
    });
  });

  it("returns 500 when internal mutation fails", async () => {
    const runMutation = vi.fn().mockRejectedValue(new Error("mutation failed"));
    const ctx = { runMutation };
    const request = buildIncomingRequest(
      {
        message: {
          message_id: 1004,
          date: 1700000020,
          text: "hello",
          chat: { id: 12 },
        },
      },
      SECRET,
    );

    const response = await handleIncomingWebhook(ctx, request);

    expect(response.status).toBe(500);
    expect(runMutation).toHaveBeenCalledTimes(1);
  });
});
