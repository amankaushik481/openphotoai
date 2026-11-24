/**
 * `pnpm worker` — background job worker for Docker / self-hosting (Vercel uses /api/cron/jobs).
 *
 * Every POLL_INTERVAL_MS it syncs running jobs whose provider status is stale (missed webhooks,
 * localhost without webhooks) and fails + refunds jobs stuck past their timeout. Once an hour (and at
 * start) it also runs the maintenance pass that Vercel runs via /api/cron/maintenance, in the
 * background and never two at once. SIGTERM/SIGINT finish the current pass, wait for a running
 * maintenance pass, close the database and exit cleanly.
 *
 * Run via `pnpm worker`, which preloads scripts/preload/server-only.mjs (server modules import
 * `server-only`, which throws outside Next's react-server build).
 */
import { setTimeout as sleep } from "node:timers/promises";
import { loadDotEnv } from "./lib/env";
import { errorMessage, log } from "./lib/log";
import { createPeriodicTask } from "./lib/periodic";

loadDotEnv();

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS) || 5_000;
const BATCH_LIMIT = Number(process.env.WORKER_BATCH_LIMIT) || 50;
/** 0 disables maintenance in the worker (e.g. when an external cron calls /api/cron/maintenance). */
const MAINTENANCE_INTERVAL_MS = (() => {
  const raw = Number(process.env.WORKER_MAINTENANCE_INTERVAL_MS?.trim() || NaN);
  return Number.isFinite(raw) && raw >= 0 ? raw : 3_600_000;
})();

const { pollStaleJobs } = await import("@/server/jobs/engine");
const { runMaintenance } = await import("@/server/maintenance");
const { closeDb } = await import("@/db");

const maintenance = createPeriodicTask({
  intervalMs: MAINTENANCE_INTERVAL_MS,
  run: async () => {
    const started = Date.now();
    const r = await runMaintenance();
    const changed = Object.entries(r).filter(([, n]) => n > 0);
    if (changed.length) {
      log.info(`maintenance: ${changed.map(([k, n]) => `${k} ${n}`).join(" · ")} (${Date.now() - started}ms)`);
    }
  },
  onError: (err) => log.error(`maintenance failed: ${errorMessage(err)}`),
});

let stopping = false;
const abort = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    log.info(`${signal} received — finishing the current pass…`);
    stopping = true;
    abort.abort();
  });
}

const maintenanceNote = MAINTENANCE_INTERVAL_MS > 0 ? `, maintenance every ${Math.round(MAINTENANCE_INTERVAL_MS / 60_000)}min` : "";
log.step(`Job worker started (every ${POLL_INTERVAL_MS / 1000}s${maintenanceNote})`);
while (!stopping) {
  const started = Date.now();
  if (MAINTENANCE_INTERVAL_MS > 0) maintenance.tick(started);
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

await maintenance.idle();
await closeDb().catch(() => undefined);
log.ok("Job worker stopped");
process.exit(0);
