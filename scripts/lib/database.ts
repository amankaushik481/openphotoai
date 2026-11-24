/** Parse and describe DATABASE_URL values (`postgres://…`, `pglite:memory`, `pglite:./path`). */
import path from "node:path";

export type DatabaseTarget =
  | { kind: "pglite"; memory: true }
  | { kind: "pglite"; memory: false; dataDir: string }
  | { kind: "postgres"; url: string };

export function parseDatabaseUrl(url: string, cwd = process.cwd()): DatabaseTarget {
  if (url.startsWith("pglite:")) {
    const target = url.slice("pglite:".length);
    if (target === "" || target === "memory") return { kind: "pglite", memory: true };
    return { kind: "pglite", memory: false, dataDir: path.resolve(cwd, target) };
  }
  if (/^postgres(ql)?:\/\//.test(url)) return { kind: "postgres", url };
  throw new Error(`Unsupported DATABASE_URL "${redactDatabaseUrl(url)}". Use postgres://… or pglite:./path (or pglite:memory).`);
}

/** Hide the password of a connection string for logs. */
export function redactDatabaseUrl(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/[^:/@]+):[^@]*@/i, "$1:***@");
}

/** Short human label, e.g. "Postgres localhost:5432/openshoot" or "PGlite (in memory)". */
export function describeDatabase(target: DatabaseTarget): string {
  if (target.kind === "pglite") return target.memory ? "PGlite (in memory)" : `PGlite (${path.relative(process.cwd(), target.dataDir) || "."})`;
  try {
    const u = new URL(target.url);
    return `Postgres ${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return `Postgres ${redactDatabaseUrl(target.url)}`;
  }
}

/** Transaction poolers (pgbouncer, Supabase :6543) don't support prepared statements or session locks. */
export function isTransactionPooler(url: string): boolean {
  return /pooler|pgbouncer|:6543/.test(url);
}
