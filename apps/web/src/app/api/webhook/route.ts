import { processWebhookEvent, storeWebhookEvent } from "@/lib/webhook";
import { webhookHasMeta } from "@/lib/typeguards";
import { verifySignature } from "@/lib/signature";

export async function POST(request: Request) {
  // Upstream answered 500 "…not set in .env". A deployment that has not
  // connected Lemon Squeezy yet is not broken, so it says so with a 503.
  if (!process.env.LEMONSQUEEZY_WEBHOOK_SECRET) {
    return Response.json(
      { error: "Lemon Squeezy is not connected." },
      { status: 503 },
    );
  }

  /* -------------------------------------------------------------------------- */
  /*             First, make sure the request is from Lemon Squeezy.            */
  /* -------------------------------------------------------------------------- */

  // Get the raw body content.
  const rawBody = await request.text();

  // Compare the HMAC-SHA256 of the raw body under the secret to the
  // signature header (WebCrypto, src/lib/signature.ts).
  const valid = await verifySignature(
    rawBody,
    request.headers.get("X-Signature"),
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET,
  );

  if (!valid) {
    return new Response("Invalid signature", { status: 400 });
  }

  /* -------------------------------------------------------------------------- */
  /*                                Valid request                               */
  /* -------------------------------------------------------------------------- */

  let data: unknown;
  try {
    data = JSON.parse(rawBody) as unknown;
  } catch {
    return new Response("Data invalid", { status: 400 });
  }

  // Type guard to check if the object has a 'meta' property.
  if (webhookHasMeta(data)) {
    const webhookEventId = await storeWebhookEvent(data.meta.event_name, data);

    await processWebhookEvent(webhookEventId);

    return new Response("OK", { status: 200 });
  }

  return new Response("Data invalid", { status: 400 });
}
