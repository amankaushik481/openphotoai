/**
 * Test database helpers: a fresh in-memory PGlite database with all migrations applied.
 *
 *   beforeEach(async () => { await createTestDb(); });
 *   const u = await createTestUser({ credits: 50 });
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { setDb, type Database } from "@/db";
import * as schema from "@/db/schema";
import type { UserRow } from "@/db/types";
import { newId } from "@/lib/ids";

export async function createTestDb(): Promise<Database> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  setDb(db as unknown as Database);
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
