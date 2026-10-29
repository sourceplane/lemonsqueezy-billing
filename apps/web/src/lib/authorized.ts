import { isGitHubConnected } from "@/lib/connections";

/**
 * Upstream's `authorized` callback (src/auth.ts), which the proxy runs for
 * every page: the dashboard needs a signed-in user, and a signed-in user on
 * any other page is sent to the dashboard.
 *
 * One change: until GitHub is connected nobody can sign in, so the dashboard
 * is a preview anyone may open. It has no user, so it shows no one's data,
 * and every action that changes something requires a session.
 */
export function authorized({
  request: { nextUrl },
  auth,
}: {
  request: { nextUrl: URL };
  auth: { user?: unknown } | null;
}): boolean | Response {
  const isLoggedIn = Boolean(auth?.user);
  const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");

  if (isOnDashboard) {
    // Redirect unauthenticated users to the login page — once there is one.
    return isLoggedIn || !isGitHubConnected();
  } else if (isLoggedIn) {
    // Redirect authenticated users to the dashboard
    return Response.redirect(new URL("/dashboard", nextUrl));
  }

  // Allow unauthenticated users to access other pages
  return true;
}
