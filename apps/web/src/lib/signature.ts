// Lemon Squeezy signs every webhook with HMAC-SHA256 over the raw body, hex in
// the `X-Signature` header. Upstream checked it with node:crypto's createHmac
// and timingSafeEqual; this is the same check in WebCrypto, which a Worker has
// natively, with a constant-time comparison of the two digests.

function fromHex(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function equalConstantTime(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when `signatureHex` is the HMAC-SHA256 of `body` under `secret`. */
export async function verifySignature(
  body: string,
  signatureHex: string | null,
  secret: string,
): Promise<boolean> {
  const given = fromHex(signatureHex ?? "");
  if (!given) {
    return false;
  }
  const expected = fromHex(await hmacSha256Hex(secret, body));
  return expected !== null && equalConstantTime(expected, given);
}
