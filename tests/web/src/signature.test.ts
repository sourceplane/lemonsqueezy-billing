import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacSha256Hex, verifySignature } from "@/lib/signature";

// Upstream verified Lemon Squeezy's X-Signature header with node:crypto:
// the hex HMAC-SHA256 of the raw body under the webhook secret, compared with
// timingSafeEqual. src/lib/signature.ts does the same with WebCrypto, which
// a Worker has without the Node compatibility layer. These hold it to
// node:crypto's answer.
const SECRET = "a-webhook-secret";
const BODY = JSON.stringify({ meta: { event_name: "subscription_created" }, data: { id: "1" } });
const upstream = (body: string, signature: string) => {
  const digest = Buffer.from(createHmac("sha256", SECRET).update(body).digest("hex"), "hex");
  const given = Buffer.from(signature, "hex");
  return digest.length === given.length && timingSafeEqual(digest, given);
};

describe("the webhook signature (src/lib/signature.ts)", () => {
  it("computes the same HMAC-SHA256 as node:crypto", async () => {
    expect(await hmacSha256Hex(SECRET, BODY)).toBe(createHmac("sha256", SECRET).update(BODY).digest("hex"));
  });

  it("accepts the signature Lemon Squeezy would send, as upstream did", async () => {
    const signature = createHmac("sha256", SECRET).update(BODY).digest("hex");
    expect(upstream(BODY, signature)).toBe(true);
    expect(await verifySignature(BODY, signature, SECRET)).toBe(true);
    expect(await verifySignature(BODY, signature.toUpperCase(), SECRET)).toBe(true);
  });

  it("refuses a body that was changed, a wrong secret, and no signature", async () => {
    const signature = createHmac("sha256", SECRET).update(BODY).digest("hex");
    expect(await verifySignature(`${BODY} `, signature, SECRET)).toBe(false);
    expect(await verifySignature(BODY, signature, "another-secret")).toBe(false);
    expect(await verifySignature(BODY, null, SECRET)).toBe(false);
    expect(await verifySignature(BODY, "", SECRET)).toBe(false);
  });

  it("refuses a signature that is not 32 bytes of hex", async () => {
    const signature = createHmac("sha256", SECRET).update(BODY).digest("hex");
    expect(await verifySignature(BODY, signature.slice(0, 62), SECRET)).toBe(false);
    expect(await verifySignature(BODY, `${signature}00`, SECRET)).toBe(false);
    expect(await verifySignature(BODY, `zz${signature.slice(2)}`, SECRET)).toBe(false);
  });
});
