import { beforeEach, describe, expect, it } from "vitest";
import { authorized } from "@/lib/authorized";

// src/lib/authorized.ts — upstream's `authorized` callback, which the proxy
// runs for every page. The dashboard needs a signed-in user once GitHub sign-in
// is connected; until then nobody could sign in, so it is a preview.
const at = (pathname: string) => ({ nextUrl: new URL(`https://billing.example${pathname}`) });
const signedIn = { user: { id: "u1" } };

describe("who may open a page (src/lib/authorized.ts)", () => {
  beforeEach(() => {
    delete process.env.AUTH_GITHUB_ID;
    delete process.env.AUTH_GITHUB_SECRET;
  });

  it("with GitHub connected: the dashboard needs a session, as upstream's did", () => {
    process.env.AUTH_GITHUB_ID = "id";
    process.env.AUTH_GITHUB_SECRET = "secret";
    expect(authorized({ request: at("/dashboard"), auth: null })).toBe(false);
    expect(authorized({ request: at("/dashboard/billing"), auth: { user: undefined } })).toBe(false);
    expect(authorized({ request: at("/dashboard/billing"), auth: signedIn })).toBe(true);
  });

  it("with GitHub not connected: the dashboard is a preview anyone may open", () => {
    expect(authorized({ request: at("/dashboard"), auth: null })).toBe(true);
    expect(authorized({ request: at("/dashboard/billing"), auth: null })).toBe(true);
  });

  it("sends a signed-in visitor from the sign-in page to the dashboard", () => {
    const res = authorized({ request: at("/"), auth: signedIn });
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).headers.get("location")).toBe("https://billing.example/dashboard");
  });

  it("lets anyone else see the other pages", () => {
    expect(authorized({ request: at("/"), auth: null })).toBe(true);
  });
});
