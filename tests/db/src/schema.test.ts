import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { manifest } from "@saas/db/manifest";
import * as schema from "../../../apps/web/src/db/schema";

// Upstream created its tables with `drizzle-kit push` straight from the app's
// Drizzle schema; here db-migrate creates them from packages/db's SQL. The
// app queries through that schema, so the two must agree: every table it
// declares exists after the migrations with exactly its columns, each with
// the declared nullability and type, and with the declared primary keys.
const migrationsDir = path.resolve(__dirname, "../../../packages/db/src/migrations");

const tables = (Object.values(schema) as unknown[]).filter(
  (v): v is PgTable => typeof v === "object" && v !== null && Symbol.for("drizzle:IsDrizzleTable") in v,
);

// drizzle's SQL type → what information_schema reports for it.
function pgType(sqlType: string): string {
  if (sqlType === "serial") return "integer";
  if (sqlType === "timestamp") return "timestamp without time zone";
  return sqlType;
}

type Col = { column_name: string; is_nullable: "YES" | "NO"; data_type: string };

describe("the migrated tables match the app's Drizzle schema", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    for (const entry of manifest.migrations) {
      await db.exec(readFileSync(path.join(migrationsDir, entry.path), "utf8"));
    }
  }, 60_000);

  it("declares the template's seven tables", () => {
    expect(tables.map((t) => getTableConfig(t).name).sort()).toEqual([
      "account",
      "plan",
      "session",
      "subscription",
      "user",
      "verificationToken",
      "webhookEvent",
    ]);
  });

  for (const table of tables) {
    const config = getTableConfig(table);
    it(`"${config.name}": the columns, their types and nullability`, async () => {
      const { rows } = await db.query<Col>(
        `select column_name, is_nullable, data_type from information_schema.columns
          where table_schema = 'public' and table_name = $1 order by column_name`,
        [config.name],
      );
      const want = config.columns
        .map((c) => ({
          column_name: c.name,
          is_nullable: c.notNull || c.primary ? "NO" : "YES",
          data_type: pgType(c.getSQLType()),
        }))
        .sort((a, b) => (a.column_name < b.column_name ? -1 : 1));
      expect(rows).toEqual(want);
    });

    it(`"${config.name}": the primary key`, async () => {
      const { rows } = await db.query<{ column_name: string }>(
        `select a.attname as column_name
           from pg_index i
           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
          where i.indrelid = format('public.%I', $1::text)::regclass and i.indisprimary
          order by a.attname`,
        [config.name],
      );
      const want = [
        ...config.columns.filter((c) => c.primary).map((c) => c.name),
        ...config.primaryKeys.flatMap((pk) => pk.columns.map((c) => c.name)),
      ].sort();
      expect(rows.map((r) => r.column_name)).toEqual(want);
    });
  }
});
