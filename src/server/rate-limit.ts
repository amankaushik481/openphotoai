/**
 * Postgres-backed fixed-window rate limiter. CONTRACT FILE (owner: platform-core).
 *
 * One row per (key, window) in `rate_limits`. Each hit is a single atomic upsert
 * (`INSERT ... ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + $cost
 * RETURNING count`), so concurrent requests can never both slip under the limit and no
 * Redis is needed. Old windows are removed by `pruneRateLimits()` (maintenance cron).
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { RATE_LIMITS, type RateLimitName } from "@/config/rate-limits";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { errors } from "@/server/http";

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

/** Longest configured window; rows older than this can never be read again. */
const MAX_WINDOW_SEC = Math.max(...Object.values(RATE_LIMITS).map((l) => l.windowSec));

function windowStartFor(nowMs: number, windowSec: number): Date {
  const windowMs = windowSec * 1000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

/** Increment and check. Does not throw. */
export async function checkRateLimit(name: RateLimitName, subject: string, cost = 1): Promise<RateLimitResult> {
  if (!Number.isInteger(cost) || cost < 0) throw new RangeError(`rate limit cost must be a non-negative integer (got ${cost})`);
  const { limit, windowSec } = RATE_LIMITS[name];
  const windowStart = windowStartFor(Date.now(), windowSec);
  const resetAt = new Date(windowStart.getTime() + windowSec * 1000);

  const [row] = await db
    .insert(rateLimits)
    .values({ key: `${name}:${subject}`, windowStart, count: cost })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + ${cost}` },
    })
    .returning({ count: rateLimits.count });

  const count = row?.count ?? cost;
  return { ok: count <= limit, limit, remaining: Math.max(0, limit - count), resetAt };
}

/** Read the current window without counting a hit (no write). For "N left today" UI. */
export async function peekRateLimit(name: RateLimitName, subject: string): Promise<RateLimitResult> {
  const { limit, windowSec } = RATE_LIMITS[name];
  const windowStart = windowStartFor(Date.now(), windowSec);
  const resetAt = new Date(windowStart.getTime() + windowSec * 1000);
  const [row] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, `${name}:${subject}`), eq(rateLimits.windowStart, windowStart)))
    .limit(1);
  const count = row?.count ?? 0;
  return { ok: count < limit, limit, remaining: Math.max(0, limit - count), resetAt };
}

/** Increment and throw AppError("rate_limited") when over the limit. */
export async function rateLimit(name: RateLimitName, subject: string, cost = 1): Promise<void> {
  const result = await checkRateLimit(name, subject, cost);
  if (!result.ok) {
    const retryAfterSec = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
    throw errors.rateLimited(retryAfterSec);
  }
}

/**
 * Delete counters whose window started before `olderThan` (default: longer ago than the
 * longest configured window, i.e. every expired row). Returns the number of rows deleted.
 */
export async function pruneRateLimits(olderThan: Date = new Date(Date.now() - MAX_WINDOW_SEC * 1000)): Promise<number> {
  const deleted = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, olderThan))
    .returning({ key: rateLimits.key });
  return deleted.length;
}
