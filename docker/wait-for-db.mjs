// Wait until DATABASE_URL accepts queries (Postgres may still be starting up).
// PGlite URLs need no waiting. Never logs the connection string (it holds a password).
import postgres from "postgres";

const url = process.env.DATABASE_URL?.trim() ?? "";
if (!url || url.startsWith("pglite:")) process.exit(0);

const timeoutMs = Number(process.env.DB_WAIT_TIMEOUT ?? 60) * 1000;
const deadline = Date.now() + timeoutMs;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (let attempt = 1; ; attempt++) {
  const sql = postgres(url, { max: 1, connect_timeout: 5, idle_timeout: 1, onnotice: () => {} });
  try {
    await sql`select 1`;
    await sql.end({ timeout: 1 });
    if (attempt > 1) console.error("[wait-for-db] database is ready");
    process.exit(0);
  } catch (err) {
    await sql.end({ timeout: 1 }).catch(() => {});
    const reason = err instanceof Error ? err.message : String(err);
    if (Date.now() >= deadline) {
      console.error(`[wait-for-db] database not reachable after ${timeoutMs / 1000}s: ${reason}`);
      process.exit(1);
    }
    if (attempt === 1 || attempt % 5 === 0) console.error(`[wait-for-db] waiting for database (${reason})`);
    await sleep(2000);
  }
}
