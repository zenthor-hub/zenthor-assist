import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifySignature } from "./webhook";

/** Helper to generate a valid HMAC-SHA256 signature for testing. */
function sign(body: string, secret: string): string {
  const hmac = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hmac}`;
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
