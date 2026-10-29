import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { isGitHubConnected, isLemonSqueezyConnected } from "@/lib/connections";

// Not upstream's: the deploy's smoke check and the bootstrap's probe read
// this. A sign-in page that renders proves the Worker deployed; this proves
// what that page never touches — the HYPERDRIVE binding names a real config,
// Hyperdrive reaches the Supabase database, and db-migrate applied the schema
// (upstream's tables and the key Auth.js signs with). Read-only. It also says
// which third parties are connected — whether their keys are stored, never
// what they are — which the 02-docs record reads.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    const [row] = await db.execute<{
      plans: string | null;
      secrets: string | null;
    }>(
      sql`select to_regclass('public.plan')::text as plans,
                 to_regclass('app_private.secrets')::text as secrets`,
    );
    const ok = Boolean(row?.plans && row?.secrets);
    return Response.json(
      {
        ok,
        database: "reachable",
        schema: ok ? "migrated" : "missing",
        connected: connected(),
      },
      { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    // eslint-disable-next-line no-console -- the deploy's log is where this goes
    console.error("health: database check failed", error);
    return Response.json(
      { ok: false, database: "unreachable", connected: connected() },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

function connected() {
  return {
    lemonSqueezy: isLemonSqueezyConnected(),
    github: isGitHubConnected(),
  };
}
