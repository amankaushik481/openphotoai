/**
 * Database client. Supports:
 *   - postgres://...            (postgres-js; Supabase, Neon, Docker, any Postgres)
 *   - pglite:./path | pglite:memory   (embedded Postgres via PGlite; zero-setup dev + unit tests)
 *
 * `db` is a lazy proxy so importing this module never opens a connection by itself.
 * Tests call `setDb()` with an in-memory PGlite instance (see tests/helpers/db.ts).
 */
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export { schema };

let instance: Database | undefined;
let closer: (() => Promise<void>) | undefined;

function createDb(url: string): Database {
  if (url.startsWith("pglite:")) {
    const target = url.slice("pglite:".length);
    const client = target === "memory" || target === "" ? new PGlite() : new PGlite(target);
    closer = () => client.close();
    return drizzlePglite(client, { schema, casing: "snake_case" }) as unknown as Database;
  }
  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX) || 10,
    prepare: !/pooler|pgbouncer|:6543/.test(url), // transaction poolers don't support prepared statements
  });
  closer = () => client.end({ timeout: 5 });
  return drizzlePostgres(client, { schema, casing: "snake_case" }) as unknown as Database;
}

const globalForDb = globalThis as unknown as { __openshootDb?: Database };

export function getDb(): Database {
  if (instance) return instance;
  if (globalForDb.__openshootDb) return (instance = globalForDb.__openshootDb);
  const url = process.env.DATABASE_URL || "pglite:./.data/pglite";
  instance = createDb(url);
  // Reuse across hot reloads in dev.
  if (process.env.NODE_ENV !== "production") globalForDb.__openshootDb = instance;
  return instance;
}

/** Replace the database instance (tests). */
export function setDb(next: Database | undefined) {
  instance = next;
  globalForDb.__openshootDb = next;
}

export async function closeDb() {
  await closer?.();
  instance = undefined;
  globalForDb.__openshootDb = undefined;
}

export const db: Database = new Proxy({} as Database, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});
