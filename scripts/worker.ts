/**
 * `pnpm worker` — background job worker for Docker / self-hosting (Vercel uses /api/cron/jobs).
 *
 * Every POLL_INTERVAL_MS it syncs running jobs whose provider status is stale (missed webhooks,
 * localhost without webhooks) and fails + refunds jobs stuck past their timeout. SIGTERM/SIGINT
 * finish the current pass, close the database and exit cleanly.
 */
import { registerHooks } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { loadDotEnv } from "./lib/env";
import { errorMessage, log } from "./lib/log";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS) || 5_000;
const BATCH_LIMIT = Number(process.env.WORKER_BATCH_LIMIT) || 50;

// `server-only` throws outside Next's react-server build; the worker legitimately runs server code.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export%20%7B%7D", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

loadDotEnv();

const { pollStaleJobs } = await import("@/server/jobs/engine");
const { closeDb } = await import("@/db");

let stopping = false;
const abort = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    log.info(`${signal} received — finishing the current pass…`);
    stopping = true;
    abort.abort();
  });
}

log.step(`Job worker started (every ${POLL_INTERVAL_MS / 1000}s)`);
while (!stopping) {
  const started = Date.now();
  try {
    const r = await pollStaleJobs({ limit: BATCH_LIMIT });
    if (r.checked || r.completed || r.failed) {
      log.info(`checked ${r.checked} · completed ${r.completed} · failed ${r.failed} (${Date.now() - started}ms)`);
    }
  } catch (err) {
    log.error(`poll failed: ${errorMessage(err)}`);
  }
  if (stopping) break;
  await sleep(Math.max(0, POLL_INTERVAL_MS - (Date.now() - started)), undefined, { signal: abort.signal }).catch(
    () => undefined,
  );
}

await closeDb().catch(() => undefined);
log.ok("Job worker stopped");
process.exit(0);
