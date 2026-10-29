import type { MigrationManifest } from "./types.js";

// Every migration the runner applies, in order, with the sha256 of its file.
// `pnpm --filter @saas/db run manifest:check` verifies the checksums;
// `manifest:fix` rewrites them after a migration file changes (only ever
// before that migration has been applied anywhere — an applied migration's
// checksum is immutable).
export const manifest: MigrationManifest = {
  version: 1,
  migrations: [
    {
      id: "000_control_baseline",
      context: "control",
      path: "000_control/up.sql",
      checksum:
        "2a5d7f30684c99e3ff441ca8a2c38038dedd1bab4db4a40e92cd36bb22be297f",
      description:
        "Baseline control migration — creates the migration tracking schema",
    },
    {
      id: "010_billing_schema",
      context: "app",
      path: "010_billing_schema/up.sql",
      checksum:
        "38bd83fb65a731e273d457b186a3adddf437e49e6916ed59bc37af9e306c762e",
      description:
        "The template's schema (apps/web/src/db/schema.ts, which upstream applied with drizzle-kit push), as drizzle-kit would generate it: Auth.js's user, account, session and verificationToken, then webhookEvent, plan, subscription and their foreign keys",
    },
    {
      id: "020_app_secrets",
      context: "app",
      path: "020_app_secrets/up.sql",
      checksum:
        "e6bca2475ba2183c6f7e5df7c781229a6eb210c4081e5e7a52b41bedfc0a2a88",
      description:
        "app_private.secrets, and the key Auth.js signs with that a fresh environment starts with (apps/web/src/lib/auth-secret.ts)",
    },
    {
      id: "030_row_level_security",
      context: "app",
      path: "030_row_level_security/up.sql",
      checksum:
        "5c6162f0346b8521e2db499a59b4ee86a623d00fc5b1c22d4e6bfaa442760d23",
      description:
        "Row-level security, with no policies, on every table in public — closed to Supabase's Data API (anon, authenticated), open to the app, which owns them; refuses to run if the app's role would be locked out",
    },
  ],
};
