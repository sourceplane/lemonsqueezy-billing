import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// src/app/api/webhook/route.ts — where Lemon Squeezy delivers its webhooks.
// Upstream answered 500 when the secret was unset and checked the signature
// with node:crypto; here a deployment that has not connected Lemon Squeezy
// says so (503), a bad signature is refused (400) before anything is stored,
// and a signed event is stored and then processed. Storage and processing
// are mocked: webhook-processing.test.ts runs them on a real database.
const storeWebhookEvent = vi.fn(async (eventName: string, body: unknown) => ({ id: 7, eventName, body }));
const processWebhookEvent = vi.fn(async () => undefined);
vi.mock("@/lib/webhook", () => ({ storeWebhookEvent, processWebhookEvent }));

const SECRET = "a-webhook-secret";
const EVENT = {
  meta: { event_name: "subscription_created", custom_data: { user_id: "u1" } },
  data: { id: "1", attributes: {} },
};
const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("hex");
const post = (body: string, signature?: string) =>
  new Request("https://billing.example/api/webhook", {
    method: "POST",
    body,
    headers: signature === undefined ? {} : { "X-Signature": signature },
  });

describe("POST /api/webhook", () => {
  beforeEach(() => {
    storeWebhookEvent.mockClear();
    processWebhookEvent.mockClear();
    delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  });

  it("says Lemon Squeezy is not connected while the secret is unset, storing nothing", async () => {
    const { POST } = await import("@/app/api/webhook/route");
    const body = JSON.stringify(EVENT);
    const res = await POST(post(body, sign(body)));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Lemon Squeezy is not connected." });
    expect(storeWebhookEvent).not.toHaveBeenCalled();
  });

  it("refuses an unsigned or wrongly signed event, storing nothing", async () => {
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = SECRET;
    const { POST } = await import("@/app/api/webhook/route");
    const body = JSON.stringify(EVENT);
    expect((await POST(post(body))).status).toBe(400);
    expect((await POST(post(body, sign(`${body}x`)))).status).toBe(400);
    expect(storeWebhookEvent).not.toHaveBeenCalled();
  });

  it("refuses a signed body that is not an event", async () => {
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = SECRET;
    const { POST } = await import("@/app/api/webhook/route");
    expect((await POST(post("not json", sign("not json")))).status).toBe(400);
    const noMeta = JSON.stringify({ data: {} });
    expect((await POST(post(noMeta, sign(noMeta)))).status).toBe(400);
    expect(storeWebhookEvent).not.toHaveBeenCalled();
  });

  it("stores a signed event under its name, then processes it", async () => {
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = SECRET;
    const { POST } = await import("@/app/api/webhook/route");
    const body = JSON.stringify(EVENT);
    const res = await POST(post(body, sign(body)));
    expect(res.status).toBe(200);
    expect(storeWebhookEvent).toHaveBeenCalledWith("subscription_created", EVENT);
    expect(processWebhookEvent).toHaveBeenCalledWith({ id: 7, eventName: "subscription_created", body: EVENT });
  });
});
