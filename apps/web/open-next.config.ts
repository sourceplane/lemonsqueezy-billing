// OpenNext Cloudflare adapter config.
//
// Every page of this template renders per request — the proxy and the
// dashboard read the session, the billing page reads the database and Lemon
// Squeezy — so the build pre-renders next to nothing and no incremental
// cache is exercised. The read-only static-assets cache is kept as the
// default that costs nothing to provision: a page that becomes static later
// is served from it, and a page that revalidates for real (ISR,
// `revalidateTag`) is the signal to swap in the R2 incremental cache plus a
// tag cache. (The server actions' revalidatePath calls are upstream's; on
// this cache they have nothing to invalidate.)
import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
