/** Request helpers shared by the jobs/batches route handlers (session API + public API v1). */
import { timingSafeEqual } from "node:crypto";
import type { JobRow } from "@/db/types";
import { env } from "@/lib/env";
import { errors } from "@/server/http";
import { syncJob } from "./engine";
import { errorMessage, mapLimit } from "./util";

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
/** Running jobs lazily synced per list/batch request (the rest are picked up by the next poll). */
const MAX_LAZY_SYNC = 10;

/** `Idempotency-Key` header (optional). Throws validation_error when malformed. */
export function readIdempotencyKey(req: Request): string | null {
  const raw = req.headers.get("idempotency-key");
  if (raw === null) return null;
  const key = raw.trim();
  if (!key) return null;
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH || !/^[\x21-\x7e]+$/.test(key)) {
    throw errors.validation(`Idempotency-Key must be 1-${MAX_IDEMPOTENCY_KEY_LENGTH} printable ASCII characters.`);
  }
  return key;
}

/**
 * Lazily sync running jobs (polling fallback for pages that watch many jobs, e.g. a batch).
 * syncJob throttles per job, so frequent polling doesn't hammer the provider.
 */
export async function syncRunningJobs(rows: JobRow[]): Promise<JobRow[]> {
  const running = rows.filter((r) => r.status === "running").slice(0, MAX_LAZY_SYNC);
  if (!running.length) return rows;
  const synced = await mapLimit(running, 4, (job) =>
    syncJob(job.id).catch((err) => {
      console.warn(`[jobs] lazy sync failed for ${job.id}:`, errorMessage(err));
      return job;
    }),
  );
  const byId = new Map(synced.map((j) => [j.id, j]));
  return rows.map((r) => byId.get(r.id) ?? r);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Cron endpoints: `Authorization: Bearer ${CRON_SECRET}` (what Vercel Cron sends).
 * Without CRON_SECRET the endpoint is open in development but always refused in production.
 */
export function assertCronRequest(req: Request): void {
  const secret = env.CRON_SECRET;
  if (!secret) {
    if (env.isProd) throw errors.unauthorized("CRON_SECRET is not configured.");
    return;
  }
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    throw errors.unauthorized("Invalid cron credentials.");
  }
}
