import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleIncomingWebhook, verifySignature } from "./webhook";

/** Helper to generate a valid HMAC-SHA256 signature for testing. */
function sign(body: string, secret: string): string {
  const hmac = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hmac}`;
}

function buildIncomingRequest(payload: object, secret: string): Request {
  const body = JSON.stringify(payload);
  const signature = sign(body, secret);
  return new Request("https://example.com/whatsapp-cloud/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": signature,
    },
    body,
  });
}

describe("verifySignature", () => {
  const SECRET = "test-app-secret";

  it("returns true for valid signature", async () => {
    const body = '{"object":"whatsapp_business_account"}';
    const signature = sign(body, SECRET);

    expect(await verifySignature(body, signature, SECRET)).toBe(true);
  });

  it("returns false for invalid signature", async () => {
    const body = '{"object":"whatsapp_business_account"}';
    const signature = "sha256=0000000000000000000000000000000000000000000000000000000000000000";

    expect(await verifySignature(body, signature, SECRET)).toBe(false);
  });

  it("returns false when body has been tampered with", async () => {
    const original = '{"object":"whatsapp_business_account"}';
    const signature = sign(original, SECRET);
    const tampered = '{"object":"whatsapp_business_account","extra":"data"}';

    expect(await verifySignature(tampered, signature, SECRET)).toBe(false);
  });

  it("returns false for wrong secret", async () => {
    const body = '{"object":"whatsapp_business_account"}';
    const signature = sign(body, "wrong-secret");

    expect(await verifySignature(body, signature, SECRET)).toBe(false);
  });

  it("handles signature without sha256= prefix", async () => {
    const body = "test-body";
    // verifySignature strips "sha256=" prefix — passing raw hex should still work
    const hmac = createHmac("sha256", SECRET).update(body).digest("hex");

    expect(await verifySignature(body, hmac, SECRET)).toBe(true);
  });
});

describe("incoming", () => {
  const APP_SECRET = "test-whatsapp-secret";
  const basePayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: {
                phone_number_id: "1234567890",
              },
              messages: [
                {
                  from: "+15551234567",
                  id: "wamid.abc123",
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: "hello from webhook test" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    process.env.WHATSAPP_CLOUD_APP_SECRET = APP_SECRET;
    delete process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
  });

  afterEach(() => {
    delete process.env.WHATSAPP_CLOUD_APP_SECRET;
    delete process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
    vi.restoreAllMocks();
  });

  it("returns 200 when mutation batch succeeds", async () => {
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const ctx = { runMutation };
    const request = buildIncomingRequest(basePayload, APP_SECRET);

    const response = await handleIncomingWebhook(ctx, request);

    expect(response.status).toBe(200);
    expect(runMutation).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when any mutation in the batch fails", async () => {
    const runMutation = vi
      .fn()
      .mockRejectedValueOnce(new Error("Convex temporarily unavailable"))
      .mockResolvedValue(undefined);
    const ctx = { runMutation };
    const request = buildIncomingRequest(basePayload, APP_SECRET);

    const response = await handleIncomingWebhook(ctx, request);

    expect(response.status).toBe(500);
    expect(runMutation).toHaveBeenCalledTimes(1);
  });
});
