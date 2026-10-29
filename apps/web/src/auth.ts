import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import { accounts, getDb, sessions, users } from "@/db";
import { authSecret } from "@/lib/auth-secret";
import { authorized } from "@/lib/authorized";
import { appUrl, isGitHubConnected } from "@/lib/connections";

// Upstream's Auth.js setup — GitHub OAuth, database sessions through the
// Drizzle adapter, the dashboard guarded — configured LAZILY: Auth.js calls
// this per request, so each request gets its own database client over the
// HYPERDRIVE binding (src/db/index.ts) and the secret this environment's
// database generated (src/lib/auth-secret.ts). Upstream built one config at
// module load over a module-level Neon client.
//
// GitHub is offered only once its OAuth app's id and secret are stored (Orun
// secrets AUTH_GITHUB_ID and AUTH_GITHUB_SECRET, pushed to the Worker); until
// then the sign-in page says what to connect and the dashboard is open as a
// preview (src/lib/authorized.ts). `trustHost`: on Workers the
// request's own host is the app's (Vercel set AUTH_URL for upstream).
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const db = await getDb();
  return {
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
    }),
    providers: isGitHubConnected() ? [GitHub] : [],
    secret: await authSecret(),
    trustHost: true,
    // Whether the cookies carry the `__Secure-` prefix, decided ONCE, from
    // the app's own origin. Left to Auth.js it is decided per call from the
    // URL each path sees: a route handler (the OAuth callback that sets the
    // session cookie) sees the request's protocol, while the proxy and server
    // components build theirs from `x-forwarded-proto` and default to https
    // without it. On a deployment all agree (https). Under `wrangler dev`
    // over http they did not — the callback set `authjs.session-token`, the
    // proxy read `__Secure-authjs.session-token`, and every sign-in looped
    // back to the sign-in page.
    useSecureCookies: appUrl().startsWith("https:"),
    basePath: "/api/auth",
    pages: {
      signIn: "/",
    },
    callbacks: { authorized },
  } satisfies NextAuthConfig;
});
