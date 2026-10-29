import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  accounts,
  plans,
  sessions,
  subscriptions,
  users,
  verificationTokens,
  webhookEvents,
} from "./schema";

export * from "./schema";

// The one structural departure from upstream, forced by the Workers runtime.
// Upstream exported a module-level `db` over `neon(POSTGRES_URL)`. On
// Cloudflare the connection string is the Hyperdrive binding's, and a socket
// opened in one request cannot be used by another ("Cannot perform I/O on
// behalf of a different request") — a client kept across requests hangs on
// the second — so every caller opens its own:
//
//   const db = await getDb();
//
// Hyperdrive pools on its side, so a client per request costs no new database
// connection. Without a Cloudflare context — scripts and tests run under Node —
// POSTGRES_URL is the connection string, as upstream read it.
async function connectionString(): Promise<string> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const hyperdrive = (env as { HYPERDRIVE?: { connectionString: string } })
      .HYPERDRIVE;
    if (hyperdrive?.connectionString) {
      return hyperdrive.connectionString;
    }
  } catch {
    // Not running under OpenNext (a script or a test): fall through.
  }
  if (!process.env.POSTGRES_URL) {
    throw new Error("No HYPERDRIVE binding and no POSTGRES_URL");
  }
  return process.env.POSTGRES_URL;
}

const schema = {
  users,
  accounts,
  sessions,
  verificationTokens,
  webhookEvents,
  plans,
  subscriptions,
};

export async function getDb() {
  // A request holds few connections; Hyperdrive's pooler does not keep
  // prepared statements, and the type round trip buys nothing here.
  const client = postgres(await connectionString(), {
    max: 5,
    fetch_types: false,
    prepare: false,
  });
  return drizzle(client, { schema });
}

export type Database = Awaited<ReturnType<typeof getDb>>;
