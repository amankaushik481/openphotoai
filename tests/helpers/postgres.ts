/**
 * Real-Postgres test harness (PGlite has a single connection, so it can't reproduce lock ordering,
 * deadlocks or check-then-act races). Tests using it run only when TEST_POSTGRES_URL points at a
 * disposable Postgres server; every test file gets its own database (`<db>_<tag>`, dropped and
 * re-created), so files running in parallel never reset each other's schema.
 *
 *   const pg = setupPostgres("billing");
 *   describe.skipIf(!pg.enabled)("...", () => { it("...", async () => { ... }) });
 */
import { afterAll, beforeAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import postgres from "postgres";
import { setDb, type Database } from "@/db";
import * as schema from "@/db/schema";

export const TEST_POSTGRES_URL = process.env.TEST_POSTGRES_URL;

export interface PostgresHarness {
  enabled: boolean;
  /** Raw postgres-js client of this file's database (available inside tests). */
  sql: () => ReturnType<typeof postgres>;
}

function databaseUrl(base: string, tag: string): { admin: string; url: string; name: string } {
  const u = new URL(base);
  const baseName = u.pathname.replace(/^\//, "") || "postgres";
  const name = `${baseName}_${tag}`.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 63);
  const target = new URL(base);
  target.pathname = `/${name}`;
  return { admin: base, url: target.toString(), name };
}

/** Registers beforeAll/afterAll hooks that create, migrate and install a fresh database for this file. */
export function setupPostgres(tag: string, opts: { max?: number } = {}): PostgresHarness {
  let client: ReturnType<typeof postgres> | undefined;
  const enabled = Boolean(TEST_POSTGRES_URL);
  if (!enabled) {
    return {
      enabled,
      sql: () => {
        throw new Error("TEST_POSTGRES_URL is not set");
      },
    };
  }

  beforeAll(async () => {
    const { admin, url, name } = databaseUrl(TEST_POSTGRES_URL!, tag);
    const adminClient = postgres(admin, { max: 1, onnotice: () => {} });
    try {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await adminClient.unsafe(`CREATE DATABASE "${name}"`);
    } finally {
      await adminClient.end({ timeout: 5 });
    }
    client = postgres(url, { max: opts.max ?? 12, onnotice: () => {} });
    const db = drizzle(client, { schema, casing: "snake_case" });
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    setDb(db as unknown as Database);
  });

  afterAll(async () => {
    setDb(undefined);
    await client?.end({ timeout: 5 });
  });

  return {
    enabled,
    sql: () => {
      if (!client) throw new Error("Postgres harness not started");
      return client;
    },
  };
}
