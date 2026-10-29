import { beforeEach, describe, expect, it, vi } from "vitest";

// src/app/api/health/route.ts — what the deploy's smoke check reads: the
// database behind the HYPERDRIVE binding reachable, and migrated (upstream's
// tables and the generated auth key both there) — and which third parties
// are connected, by whether their keys are set. The client is mocked; the
// e2e reads it from a real Worker over a real Postgres.
const execute = vi.fn();
vi.mock("@/db", () => ({ getDb: async () => ({ execute }) }));

describe("GET /api/health", () => {
  beforeEach(() => {
    execute.mockReset();
    for (const k of ["LEMONSQUEEZY_API_KEY", "LEMONSQUEEZY_STORE_ID", "LEMONSQUEEZY_WEBHOOK_SECRET", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"]) {
      delete process.env[k];
    }
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("is ok once the schema is migrated", async () => {
    execute.mockResolvedValue([{ plans: "plan", secrets: "app_private.secrets" }]);
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      database: "reachable",
      schema: "migrated",
      connected: { lemonSqueezy: false, github: false },
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("is not ok while the migrations have not run", async () => {
    execute.mockResolvedValue([{ plans: null, secrets: null }]);
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      ok: false,
      database: "reachable",
      schema: "missing",
      connected: { lemonSqueezy: false, github: false },
    });
  });

  it("is not ok when the database cannot be reached", async () => {
    execute.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      ok: false,
      database: "unreachable",
      connected: { lemonSqueezy: false, github: false },
    });
  });

  it("says which third parties are connected, by name only", async () => {
    execute.mockResolvedValue([{ plans: "plan", secrets: "app_private.secrets" }]);
    process.env.AUTH_GITHUB_ID = "id";
    process.env.AUTH_GITHUB_SECRET = "a-secret-value";
    const { GET } = await import("@/app/api/health/route");
    const body = await (await GET()).text();
    expect(JSON.parse(body).connected).toEqual({ lemonSqueezy: false, github: true });
    expect(body).not.toContain("a-secret-value");
  });
});
