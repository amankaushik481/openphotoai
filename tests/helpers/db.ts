/**
 * Test database helpers: a fresh in-memory PGlite database with all migrations applied.
 *
 *   beforeEach(async () => { await createTestDb(); });
 *   const u = await createTestUser({ credits: 50 });
 *
 * Migrations run once per test worker; every `createTestDb()` then boots a new PGlite from a
 * dump of that migrated template (~4× faster than migrating each time) and closes the
 * previous test's instance. Row factories for other tables live in ./factories.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { setDb, type Database } from "@/db";
import * as schema from "@/db/schema";
import type { UserRow } from "@/db/types";
import { newId } from "@/lib/ids";

let template: Promise<File | Blob> | undefined;
let current: PGlite | undefined;

function migratedTemplate(): Promise<File | Blob> {
  template ??= (async () => {
    const client = new PGlite();
    try {
      await migrate(drizzle(client), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
      return await client.dumpDataDir("none");
    } finally {
      await client.close();
    }
  })();
  template.catch(() => (template = undefined)); // retry on the next call instead of caching a failure
  return template;
}

export async function createTestDb(): Promise<Database> {
  const previous = current;
  const client = new PGlite({ loadDataDir: await migratedTemplate() });
  current = client;
  const db = drizzle(client, { schema, casing: "snake_case" });
  setDb(db as unknown as Database);
  // Free the previous test's WASM heap; `db` (lazy proxy) already points at the new instance.
  await previous?.close().catch(() => undefined);
  return db as unknown as Database;
}

export async function createTestUser(overrides: Partial<typeof schema.user.$inferInsert> = {}): Promise<UserRow> {
  const { db } = await import("@/db");
  const id = overrides.id ?? newId("usr");
  const [row] = await db
    .insert(schema.user)
    .values({
      id,
      name: "Test User",
      email: `${id}@example.com`,
      emailVerified: true,
      ...overrides,
    })
    .returning();
  return row!;
}
