import path from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Upstream's next.config.mjs was empty. Two things are the Workers port's:
//
//   - `output: "standalone"`, which @opennextjs/cloudflare bundles into the
//     Worker, traced from the monorepo root so workspace dependencies resolve
//     from the root node_modules;
//   - `initOpenNextCloudflareForDev()`, which gives `next dev` the Worker's
//     bindings (the HYPERDRIVE binding, pointed at a local Postgres by
//     wrangler.jsonc's localConnectionString) through getCloudflareContext().
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  experimental: {
    // Dev server only: behind orun.work's live Preview the browser's Origin
    // is the preview's host while `next dev` sees a local Host, and Next.js
    // refuses a Server Action from an origin it is not told about. `next
    // build` runs with NODE_ENV=production, so production keeps its
    // same-origin check.
    ...(process.env.NODE_ENV === "development"
      ? { serverActions: { allowedOrigins: ["*.orun-preview.app", "preview-gateway-stage.oruncloud.workers.dev"] } }
      : {}),
  },
  // Dev server only (`next build` ignores it): orun.work's live Preview tab
  // loads `next dev` from the preview's own host, and Next.js refuses the
  // hot reload and other /_next/* dev requests from an origin it is not told
  // about. These are the preview's hosts, prod's and stage's.
  allowedDevOrigins: ["*.orun-preview.app", "preview-gateway-stage.oruncloud.workers.dev"],
};

initOpenNextCloudflareForDev();

export default nextConfig;
