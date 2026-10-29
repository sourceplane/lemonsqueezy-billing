import { beforeEach, describe, expect, it, vi } from "vitest";

// A deployment starts with none of Lemon Squeezy's keys and no GitHub OAuth
// app: they are third parties no platform brokers, and the owner connects
// them as Orun secrets (README, "Connect Lemon Squeezy", "Connect sign-in").
// Until then nothing may fail on them: every page asks src/lib/connections.ts
// and says what is missing, the SDK is never set up, and the billing page
// shows sample plans. No network: with no key, nothing reaches Lemon Squeezy.
const lemonSqueezySetup = vi.fn();
vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({ lemonSqueezySetup }));

const KEYS = [
  "LEMONSQUEEZY_API_KEY",
  "LEMONSQUEEZY_STORE_ID",
  "LEMONSQUEEZY_WEBHOOK_SECRET",
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
  "APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "WEBHOOK_URL",
];

describe("what is connected (src/lib/connections.ts)", () => {
  beforeEach(() => {
    vi.resetModules();
    lemonSqueezySetup.mockClear();
    for (const k of KEYS) delete process.env[k];
  });

  it("names every Lemon Squeezy key that is missing, and then none", async () => {
    const c = await import("@/lib/connections");
    expect(c.lemonSqueezyMissing()).toEqual([
      "LEMONSQUEEZY_API_KEY",
      "LEMONSQUEEZY_STORE_ID",
      "LEMONSQUEEZY_WEBHOOK_SECRET",
    ]);
    expect(c.isLemonSqueezyConnected()).toBe(false);
    process.env.LEMONSQUEEZY_API_KEY = "k";
    process.env.LEMONSQUEEZY_STORE_ID = "1";
    expect(c.lemonSqueezyMissing()).toEqual(["LEMONSQUEEZY_WEBHOOK_SECRET"]);
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "s";
    expect(c.isLemonSqueezyConnected()).toBe(true);
  });

  it("names the GitHub OAuth app's id and secret until both are set", async () => {
    const c = await import("@/lib/connections");
    expect(c.githubMissing()).toEqual(["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"]);
    process.env.AUTH_GITHUB_ID = "id";
    expect(c.isGitHubConnected()).toBe(false);
    process.env.AUTH_GITHUB_SECRET = "secret";
    expect(c.isGitHubConnected()).toBe(true);
  });

  it("builds the webhook URL from the app's own origin unless WEBHOOK_URL says otherwise", async () => {
    const c = await import("@/lib/connections");
    process.env.APP_URL = "https://billing.example/";
    expect(c.appUrl()).toBe("https://billing.example");
    expect(c.webhookUrl()).toBe("https://billing.example/api/webhook");
    // Upstream's WEBHOOK_URL, with or without its trailing slash.
    process.env.WEBHOOK_URL = "https://tunnel.example/";
    expect(c.webhookUrl()).toBe("https://tunnel.example/api/webhook");
  });
});

describe("the Lemon Squeezy SDK (src/config/lemonsqueezy.ts)", () => {
  beforeEach(() => {
    vi.resetModules();
    lemonSqueezySetup.mockClear();
    for (const k of KEYS) delete process.env[k];
  });

  it("is never set up while a key is missing, and says which and how to connect", async () => {
    process.env.LEMONSQUEEZY_API_KEY = "k";
    const { configureLemonSqueezy, LemonSqueezyNotConnectedError } = await import("@/config/lemonsqueezy");
    let error: unknown;
    try {
      configureLemonSqueezy();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(LemonSqueezyNotConnectedError);
    expect((error as InstanceType<typeof LemonSqueezyNotConnectedError>).missing).toEqual([
      "LEMONSQUEEZY_STORE_ID",
      "LEMONSQUEEZY_WEBHOOK_SECRET",
    ]);
    expect((error as Error).message).toMatch(/as Orun secrets and redeploy/);
    expect(lemonSqueezySetup).not.toHaveBeenCalled();
  });

  it("is set up with the API key once all three are there", async () => {
    process.env.LEMONSQUEEZY_API_KEY = "k";
    process.env.LEMONSQUEEZY_STORE_ID = "1";
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "s";
    const { configureLemonSqueezy } = await import("@/config/lemonsqueezy");
    configureLemonSqueezy();
    expect(lemonSqueezySetup).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "k" }));
  });
});

describe("the sample plans (src/lib/sample-plans.ts)", () => {
  it("can never be mistaken for a synced plan", async () => {
    const { SAMPLE_PLANS } = await import("@/lib/sample-plans");
    expect(SAMPLE_PLANS.length).toBeGreaterThan(0);
    // Lemon Squeezy's ids and the plan table's serial ids are positive.
    for (const plan of SAMPLE_PLANS) {
      expect(plan.id).toBeLessThan(0);
      expect(plan.variantId).toBeLessThan(0);
    }
  });
});
