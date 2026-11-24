/**
 * Invite email rate limit. Same fixed-window scheme (and `rate_limits` table) as
 * src/server/rate-limit.ts, with windows from ./constants until RATE_LIMITS gains an invite entry.
 * Windows are at most one day, so the maintenance cron prunes these rows like any other.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { errors } from "@/server/http";
import { INVITE_RATE_LIMITS } from "./constants";

/** Count one invite email for `userId`; throws AppError("rate_limited") over any window. */
export async function assertInviteRateLimit(userId: string, now: Date = new Date()): Promise<void> {
  for (const { name, limit, windowSec } of INVITE_RATE_LIMITS) {
    const windowMs = windowSec * 1000;
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const [row] = await db
      .insert(rateLimits)
      .values({ key: `${name}:user:${userId}`, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });
    if ((row?.count ?? 1) > limit) {
      const retryAfterSec = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000));
      throw errors.rateLimited(retryAfterSec);
    }
  }
}
