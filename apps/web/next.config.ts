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
};

initOpenNextCloudflareForDev();

export default nextConfig;
