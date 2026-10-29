// Upstream's middleware.ts, under the name Next.js 16 gives it (`proxy`):
// Auth.js's `authorized` callback guards /dashboard and sends a signed-in
// visitor from the sign-in page to it.
export { auth as proxy } from "@/auth";

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
