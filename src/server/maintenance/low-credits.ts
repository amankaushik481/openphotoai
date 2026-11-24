/** Periodic "you're running low on credits" reminders. */
import { and, desc, eq, exists, gte, isNull, lt, not, or, sql } from "drizzle-orm";
import { APP } from "@/config/app";
import { db } from "@/db";
import { jobs, user } from "@/db/schema";
import { sendEmailSafe } from "@/server/email";

export const LOW_CREDITS = {
  /** Remind users whose balance is below this. */
  threshold: 10,
  /** Only users who created a job within this many days (active users). */
  activeWithinDays: 30,
  /** At most one reminder per user per this many days. */
  remindEveryDays: 14,
  /** Max reminders per maintenance run (keeps the cron inside its time budget). */
  batchSize: 200,
} as const;

const DAY_MS = 86_400_000;

/** Users who should get a low-credit reminder now (oldest reminder first). */
export async function findLowCreditCandidates(now: Date, limit: number = LOW_CREDITS.batchSize) {
  const activeSince = new Date(now.getTime() - LOW_CREDITS.activeWithinDays * DAY_MS);
  const remindBefore = new Date(now.getTime() - LOW_CREDITS.remindEveryDays * DAY_MS);
  return db
    .select({ id: user.id, email: user.email, name: user.name, credits: user.credits })
    .from(user)
    .where(
      and(
        lt(user.credits, LOW_CREDITS.threshold),
        isNull(user.deletedAt),
        not(sql`coalesce(${user.banned}, false)`),
        or(isNull(user.lowCreditsNotifiedAt), lt(user.lowCreditsNotifiedAt, remindBefore)),
        exists(
          db
            .select({ one: sql`1` })
            .from(jobs)
            .where(and(eq(jobs.userId, user.id), gte(jobs.createdAt, activeSince))),
        ),
      ),
    )
    .orderBy(sql`${user.lowCreditsNotifiedAt} asc nulls first`, desc(user.credits))
    .limit(limit);
}

/**
 * Sends reminders and stamps `lowCreditsNotifiedAt`. Each user is claimed with a conditional
 * update first, so overlapping cron runs never double-send; a failed send releases the claim
 * so the next run retries. Returns the number of reminders sent.
 */
export async function sendLowCreditReminders(now: Date = new Date()): Promise<number> {
  const remindBefore = new Date(now.getTime() - LOW_CREDITS.remindEveryDays * DAY_MS);
  const candidates = await findLowCreditCandidates(now);
  let sent = 0;
  for (const candidate of candidates) {
    const claimed = await db
      .update(user)
      .set({ lowCreditsNotifiedAt: now })
      .where(
        and(
          eq(user.id, candidate.id),
          or(isNull(user.lowCreditsNotifiedAt), lt(user.lowCreditsNotifiedAt, remindBefore)),
        ),
      )
      .returning({ id: user.id });
    if (claimed.length === 0) continue;

    const result = await sendEmailSafe(
      "low_credits",
      candidate.email,
      { name: candidate.name, balance: Math.max(0, candidate.credits), url: `${APP.url}/app/billing` },
      { userId: candidate.id },
    );
    if (result && result.status !== "failed") {
      sent++;
    } else {
      await db
        .update(user)
        .set({ lowCreditsNotifiedAt: null })
        .where(and(eq(user.id, candidate.id), eq(user.lowCreditsNotifiedAt, now)));
    }
  }
  return sent;
}
