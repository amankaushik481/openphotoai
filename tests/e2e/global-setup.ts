/**
 * Playwright global setup: give every e2e run a clean database and storage directory.
 *
 * 1. Recreate the E2E_DATABASE_URL database (DROP … WITH (FORCE) + CREATE) when the user may;
 *    otherwise reset its schemas. Refuses to wipe a database whose name lacks "e2e"/"test".
 * 2. Apply drizzle/ migrations.
 * 3. Empty the local storage directory.
 *
 * Playwright starts the webServer BEFORE this runs, so the app must not need the DB to boot
 * (it doesn't: connections are lazy). Values come from playwright.config.ts via process.env.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { rm } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const quiet = { onnotice: () => {} };

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

async function resetSchemas(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, ...quiet });
  try {
    await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.unsafe("CREATE SCHEMA public");
  } finally {
    await sql.end();
  }
}

async function recreateDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = databaseName(target);
  if (!/e2e|test/i.test(name) || !/^[\w-]+$/.test(name)) {
    console.warn(`[e2e] Not wiping database "${name}" (name must contain "e2e" or "test"); migrating only.`);
    return;
  }
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, ...quiet });
  let recreated = false;
  try {
    // A database owner may DROP but not CREATE: only drop when we can create it again.
    const [role] = await sql<{ canCreate: boolean }[]>`
      select (rolsuper or rolcreatedb) as "canCreate" from pg_roles where rolname = current_user`;
    if (role?.canCreate) {
      await sql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await sql.unsafe(`CREATE DATABASE "${name}"`);
      recreated = true;
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[e2e] Could not recreate database "${name}" (${reason}).`);
  } finally {
    await sql.end();
  }
  if (!recreated) await resetSchemas(url);
}

async function migrateDatabase(url: string): Promise<void> {
  const client = postgres(url, { max: 1, ...quiet });
  try {
    await migrate(drizzle(client), { migrationsFolder: path.resolve("drizzle") });
  } finally {
    await client.end();
  }
}

export default async function globalSetup(): Promise<void> {
  const url = process.env.E2E_DATABASE_URL;
  const storageDir = process.env.E2E_STORAGE_DIR;
  if (!url || !storageDir) throw new Error("E2E_DATABASE_URL / E2E_STORAGE_DIR are set by playwright.config.ts");

  await recreateDatabase(url);
  await migrateDatabase(url);
  await rm(path.resolve(storageDir), { recursive: true, force: true });
}
