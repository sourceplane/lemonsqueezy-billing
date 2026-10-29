import { sql } from "drizzle-orm";

// The key Auth.js signs and encrypts its cookies with (upstream's AUTH_SECRET,
// which its README had the owner generate with `openssl rand`).
//
// A deployed Worker has no setup step, so the key is the first of these that
// exists:
//
//   1. AUTH_SECRET — a Worker secret, or .dev.vars locally. Setting it is how
//      an owner rotates the key.
//   2. the key this environment's database generated for itself: migration
//      020_app_secrets writes 64 random hex characters into
//      app_private.secrets the first time it runs, so the key is never in a
//      repository, a log or a bundle, and stage and prod each have their own.
//      `app_private` is not a schema Supabase's Data API exposes.
//
// Read once per isolate and kept as a string: it does not change under a
// running Worker, and a string (unlike a pending query) is safe to share.
let stored: string | undefined;

export async function authSecret(): Promise<string> {
  const configured = process.env.AUTH_SECRET;
  if (configured) {
    return configured;
  }
  if (stored) {
    return stored;
  }
  const { getDb } = await import("@/db");
  const db = await getDb();
  const rows = await db.execute<{ value: string }>(
    sql`select value from app_private.secrets where name = 'auth_secret'`,
  );
  const value = rows[0]?.value;
  if (!value) {
    throw new Error(
      "No AUTH_SECRET is set and the database holds no auth_secret: apply the migrations (020_app_secrets) or set AUTH_SECRET",
    );
  }
  stored = value;
  return value;
}
