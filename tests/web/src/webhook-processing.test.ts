import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { manifest } from "@saas/db/manifest";
import * as schema from "@/db/schema";

// src/lib/webhook.ts — upstream's storage and processing of Lemon Squeezy's
// webhook events, ported to a database client per call. Run on a real
// Postgres in process (PGlite) migrated by every migration db-migrate
// applies, so the queries meet the tables the deploys create. Lemon Squeezy
// itself is mocked (its SDK has a fixed API origin): getPrice answers as the
// API would.
const migrationsDir = path.resolve(__dirname, "../../../packages/db/src/migrations");
let pg: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("@/db", async () => ({
  ...(await vi.importActual<typeof import("@/db/schema")>("@/db/schema")),
  getDb: async () => db,
}));

const getPrice = vi.fn();
vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
  getPrice: (id: number) => getPrice(id),
  lemonSqueezySetup: vi.fn(),
}));

const event = (userId: string, variantId: number) => ({
  meta: { event_name: "subscription_created", custom_data: { user_id: userId } },
  data: {
    id: "sub_123",
    attributes: {
      variant_id: variantId,
      order_id: 42,
      user_name: "Sam",
      user_email: "sam@example.invalid",
      status: "active",
      status_formatted: "Active",
      renews_at: "2026-12-01T00:00:00.000000Z",
      ends_at: null,
      trial_ends_at: null,
      first_subscription_item: { id: 9, price_id: 77, is_usage_based: false },
    },
  },
});

describe("webhook events (src/lib/webhook.ts)", () => {
  beforeAll(async () => {
    pg = new PGlite();
    for (const entry of manifest.migrations) {
      await pg.exec(readFileSync(path.join(migrationsDir, entry.path), "utf8"));
    }
    db = drizzle(pg, { schema });
    await db.insert(schema.users).values({ id: "u1", email: "sam@example.invalid" });
    await db.insert(schema.plans).values({
      productId: 1,
      productName: "Product",
      variantId: 555,
      name: "Monthly",
      price: "900",
      interval: "month",
    });
  }, 60_000);

  beforeEach(() => {
    vi.resetModules();
    getPrice.mockReset();
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "s";
    process.env.LEMONSQUEEZY_API_KEY = "k";
    process.env.LEMONSQUEEZY_STORE_ID = "1";
  });

  it("stores an event with a random id in upstream's range", async () => {
    const { storeWebhookEvent, randomEventId } = await import("@/lib/webhook");
    for (let i = 0; i < 100; i++) {
      const id = randomEventId();
      expect(Number.isInteger(id) && id >= 100000000 && id < 1000000000).toBe(true);
    }
    const stored = await storeWebhookEvent("order_created", { meta: {} });
    expect(stored?.eventName).toBe("order_created");
    const [row] = await db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.id, stored!.id));
    expect(row?.processed).toBe(false);
  });

  it("creates the user's subscription from subscription_created, priced by Lemon Squeezy", async () => {
    getPrice.mockResolvedValue({ data: { data: { attributes: { unit_price: 900 } } }, error: null });
    const { processWebhookEvent, storeWebhookEvent } = await import("@/lib/webhook");
    const stored = await storeWebhookEvent("subscription_created", event("u1", 555));
    await processWebhookEvent(stored!);

    expect(getPrice).toHaveBeenCalledWith(77);
    const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.lemonSqueezyId, "sub_123"));
    expect(sub).toMatchObject({ userId: "u1", status: "active", price: "900", orderId: 42 });
    const [row] = await db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.id, stored!.id));
    expect(row).toMatchObject({ processed: true, processingError: "" });
  });

  it("updates it in place from subscription_updated", async () => {
    getPrice.mockResolvedValue({ data: { data: { attributes: { unit_price: 900 } } }, error: null });
    const { processWebhookEvent, storeWebhookEvent } = await import("@/lib/webhook");
    const body = event("u1", 555);
    body.meta.event_name = "subscription_updated";
    body.data.attributes.status = "cancelled";
    const stored = await storeWebhookEvent("subscription_updated", body);
    await processWebhookEvent(stored!);
    const subs = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.lemonSqueezyId, "sub_123"));
    expect(subs.map((s) => s.status)).toEqual(["cancelled"]);
  });

  it("records an event for a plan it does not know instead of failing", async () => {
    const { processWebhookEvent, storeWebhookEvent } = await import("@/lib/webhook");
    const stored = await storeWebhookEvent("subscription_created", event("u1", 999));
    await processWebhookEvent(stored!);
    expect(getPrice).not.toHaveBeenCalled();
    const [row] = await db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.id, stored!.id));
    expect(row?.processingError).toBe("Plan with variantId 999 not found.");
  });

  it("records that Lemon Squeezy is not connected when only the webhook secret is set", async () => {
    delete process.env.LEMONSQUEEZY_API_KEY;
    const { processWebhookEvent, storeWebhookEvent } = await import("@/lib/webhook");
    const stored = await storeWebhookEvent("subscription_created", event("u1", 555));
    await processWebhookEvent(stored!);
    expect(getPrice).not.toHaveBeenCalled();
    const [row] = await db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.id, stored!.id));
    expect(row?.processed).toBe(true);
    expect(row?.processingError).toMatch(/Lemon Squeezy is not connected: store LEMONSQUEEZY_API_KEY as Orun secrets/);
  });
});
