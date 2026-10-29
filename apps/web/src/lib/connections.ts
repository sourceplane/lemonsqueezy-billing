// What this deployment has connected, read from the Worker's environment.
// Upstream threw on the first missing variable; a product built from this
// baseline goes live before its owner has a Lemon Squeezy store or a GitHub
// OAuth app, so every page asks these instead and says what to connect.

/** The three keys Lemon Squeezy needs (upstream's configureLemonSqueezy). */
export const LEMONSQUEEZY_KEYS = [
  "LEMONSQUEEZY_API_KEY",
  "LEMONSQUEEZY_STORE_ID",
  "LEMONSQUEEZY_WEBHOOK_SECRET",
] as const;

/** The GitHub OAuth app Auth.js signs in with. */
export const GITHUB_KEYS = ["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"] as const;

function missing(keys: readonly string[]): string[] {
  return keys.filter((k) => !process.env[k]);
}

export function lemonSqueezyMissing(): string[] {
  return missing(LEMONSQUEEZY_KEYS);
}

export function isLemonSqueezyConnected(): boolean {
  return lemonSqueezyMissing().length === 0;
}

export function githubMissing(): string[] {
  return missing(GITHUB_KEYS);
}

export function isGitHubConnected(): boolean {
  return githubMissing().length === 0;
}

/**
 * The app's own origin: the APP_URL var (wrangler.jsonc), or upstream's
 * NEXT_PUBLIC_APP_URL where a local .env still sets it. No trailing slash.
 */
export function appUrl(): string {
  const url =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  return url.replace(/\/+$/, "");
}

/**
 * Where Lemon Squeezy delivers webhooks: upstream's WEBHOOK_URL plus
 * `api/webhook`, which defaults to this deployment's own origin.
 */
export function webhookUrl(): string {
  const base = (process.env.WEBHOOK_URL ?? appUrl()).replace(/\/+$/, "");
  return `${base}/api/webhook`;
}
