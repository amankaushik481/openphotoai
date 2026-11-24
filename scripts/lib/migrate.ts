/**
 * Apply the SQL migrations in `drizzle/` to Postgres (postgres-js) or PGlite.
 * Used by `pnpm db:migrate`, `pnpm run setup` and tests.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { describeDatabase, isTransactionPooler, parseDatabaseUrl } from "./database";

export interface MigrationResult {
  /** Human label of the database, e.g. "Postgres localhost:5432/openshoot". */
  database: string;
  /** Migrations applied by this run. */
  applied: number;
  /** Migrations in the journal. */
  total: number;
}

const MIGRATIONS_TABLE_EXISTS = "select to_regclass('drizzle.__drizzle_migrations') is not null as exists";
const COUNT_APPLIED = "select count(*)::int as n from drizzle.__drizzle_migrations";
/** Arbitrary constant key so concurrent deploys don't migrate at the same time. */
const MIGRATION_LOCK_KEY = 74_201_190;

export function defaultMigrationsFolder(cwd = process.cwd()): string {
  return path.resolve(cwd, "drizzle");
}

function journalSize(migrationsFolder: string): number {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  if (!existsSync(journalPath)) throw new Error(`No migrations found: ${journalPath} is missing. Run \`pnpm db:generate\`.`);
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries?: unknown[] };
  return journal.entries?.length ?? 0;
}

type QueryRows = (query: string) => Promise<Record<string, unknown>[]>;

async function countApplied(query: QueryRows): Promise<number> {
  const [table] = await query(MIGRATIONS_TABLE_EXISTS);
  if (!table?.exists) return 0;
  const [row] = await query(COUNT_APPLIED);
  return Number(row?.n ?? 0);
}

export async function runMigrations(opts: { databaseUrl: string; migrationsFolder?: string }): Promise<MigrationResult> {
  const migrationsFolder = opts.migrationsFolder ?? defaultMigrationsFolder();
  const total = journalSize(migrationsFolder);
  const target = parseDatabaseUrl(opts.databaseUrl);
  const database = describeDatabase(target);

  if (target.kind === "pglite") {
    // PGlite creates its data dir but not missing parents (e.g. `.data/`).
    if (!target.memory) mkdirSync(path.dirname(target.dataDir), { recursive: true });
    const client = target.memory ? new PGlite() : new PGlite(target.dataDir);
    try {
      const query: QueryRows = async (q) => (await client.query<Record<string, unknown>>(q)).rows;
      const before = await countApplied(query);
      await migratePglite(drizzlePglite(client), { migrationsFolder });
      return { database, applied: (await countApplied(query)) - before, total };
    } finally {
      await client.close();
    }
  }

  const pooled = isTransactionPooler(target.url);
  // One connection: the session advisory lock and the migration transaction share it.
  const client = postgres(target.url, { max: 1, prepare: !pooled, onnotice: () => {} });
  try {
    const query: QueryRows = async (q) => [...(await client.unsafe<Record<string, unknown>[]>(q))];
    if (!pooled) await client`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    try {
      const before = await countApplied(query);
      await migratePostgres(drizzlePostgres(client), { migrationsFolder });
      return { database, applied: (await countApplied(query)) - before, total };
    } finally {
      if (!pooled) await client`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}
