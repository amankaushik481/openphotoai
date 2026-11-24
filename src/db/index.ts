/**
 * Database client. Supports:
 *   - postgres://...            (postgres-js; Supabase, Neon, Docker, any Postgres)
 *   - pglite:./path | pglite:memory   (embedded Postgres via PGlite; zero-setup dev + unit tests)
 *
 * `db` is a lazy proxy so importing this module never opens a connection by itself.
 * Tests call `setDb()` with an in-memory PGlite instance (see tests/helpers/db.ts).
 */
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export { schema };

const DEFAULT_DATABASE_URL = "pglite:./.data/pglite";

interface PgliteDriver {
  PGlite: typeof import("@electric-sql/pglite").PGlite;
  drizzle: typeof import("drizzle-orm/pglite").drizzle;
}

/**
 * PGlite (~20 MB of wasm + extensions) is the zero-setup dev / test database. It is imported only when
 * DATABASE_URL is a `pglite:` URL (or unset: the default), so Postgres deployments never load it and
 * production builds can leave it out of their function traces (next.config.ts). The top-level await
 * guarantees the driver is ready before anything can call getDb() synchronously.
 */
let pgliteDriver: PgliteDriver | undefined;
let pgliteLoadError: unknown;
const urlAtStartup = process.env.DATABASE_URL?.trim();
if (!urlAtStartup || urlAtStartup.startsWith("pglite:")) {
  try {
    const [{ PGlite }, { drizzle }] = await Promise.all([import("@electric-sql/pglite"), import("drizzle-orm/pglite")]);
    pgliteDriver = { PGlite, drizzle };
  } catch (err) {
    pgliteLoadError = err; // reported by createDb() if a pglite: URL is actually used
  }
}

let instance: Database | undefined;
let closer: (() => Promise<void>) | undefined;

function createDb(url: string): Database {
  if (url.startsWith("pglite:")) {
    if (!pgliteDriver) {
      const reason = pgliteLoadError instanceof Error ? pgliteLoadError.message : "DATABASE_URL changed after startup";
      throw new Error(
        `PGlite is not available (${reason}). PGlite is for local development and tests and is left out of ` +
          "production builds: set DATABASE_URL to a Postgres URL (or build with OPENSHOOT_TRACE_PGLITE=true).",
        { cause: pgliteLoadError },
      );
    }
    const target = url.slice("pglite:".length);
    const client = target === "memory" || target === "" ? new pgliteDriver.PGlite() : new pgliteDriver.PGlite(target);
    closer = () => client.close();
    return pgliteDriver.drizzle(client, { schema, casing: "snake_case" }) as unknown as Database;
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
  const url = process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
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
