/** Small shared helpers for the admin queries. */
import { sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export function pageSize(limit: number | undefined, fallback = DEFAULT_PAGE_SIZE): number {
  return Math.min(Math.max(Math.trunc(limit ?? fallback), 1), MAX_PAGE_SIZE);
}

/** Escape LIKE/ILIKE wildcards so user input matches literally (Postgres' default escape is `\`). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Keyset condition for "newest first" lists ordered by (createdAt desc, id desc): rows strictly
 * after the cursor row. Compared in SQL so microsecond timestamps never skip or repeat rows.
 */
export function afterCursor(
  table: PgTable,
  cols: { createdAt: PgColumn; id: PgColumn },
  cursorId: string,
): SQL {
  return sql`(${cols.createdAt}, ${cols.id}) < (select c.created_at, c.id from ${table} c where c.id = ${cursorId})`;
}

/** Splits an over-fetched page (limit + 1 rows) into the page and the next cursor. */
export function paginate<T extends { id: string }>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items[items.length - 1]!.id : null };
}

/** UTC day key (YYYY-MM-DD) of a timestamp column, as plain SQL (no bind params, so it can be grouped on). */
export function utcDay(column: PgColumn): SQL<string> {
  return sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD')`;
}

/** Every UTC day key from `from` through `to` (inclusive). */
export function dayKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (cursor.getTime() <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

/** Start of the UTC day `days - 1` days before `now` (so `days = 1` means "today"). */
export function periodStart(days: number, now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
}

/** Postgres aggregates come back as strings (bigint/numeric) — normalize to numbers. */
export function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" || typeof value === "bigint") return Number(value);
  return 0;
}
