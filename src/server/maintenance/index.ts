/**
 * Periodic housekeeping, run by GET /api/cron/maintenance (Vercel Cron) or the worker.
 * Every step is idempotent and safe to run concurrently.
 */
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { deletionRequests, emailOutbox, modelShares, rateLimits } from "@/db/schema";
import { resumeStalledDeletions } from "@/server/account";
import { deleteExpiredDemoUsers } from "@/server/demo/cleanup";
import { sendLowCreditReminders } from "./low-credits";

export { isCronAuthorized } from "./cron-auth";
export { LOW_CREDITS, findLowCreditCandidates, sendLowCreditReminders } from "./low-credits";

const DAY_MS = 86_400_000;

/** Longest rate-limit window is one day; keep two so the current and previous windows survive. */
const RATE_LIMIT_RETENTION_DAYS = 2;
/** Outbox rows hold full email bodies (personal data); keep them only as long as they help support. */
export const EMAIL_OUTBOX_RETENTION_DAYS = 90;

export interface MaintenanceResult {
  lowCreditEmails: number;
  expiredModelShares: number;
  expiredDeletionRequests: number;
  prunedRateLimits: number;
  prunedEmails: number;
  /** Confirmed account deletions whose last run failed or died, finished now. */
  resumedDeletions: number;
  /** Demo accounts (DEMO_MODE) older than 24h, deleted now (bounded per run). */
  deletedDemoUsers: number;
}

export async function expirePendingModelShares(now: Date): Promise<number> {
  const rows = await db
    .update(modelShares)
    .set({ status: "expired" })
    .where(and(eq(modelShares.status, "pending"), lt(modelShares.expiresAt, now)))
    .returning({ id: modelShares.id });
  return rows.length;
}

export async function expirePendingDeletionRequests(now: Date): Promise<number> {
  const rows = await db
    .update(deletionRequests)
    .set({ status: "expired" })
    .where(and(eq(deletionRequests.status, "pending"), lt(deletionRequests.expiresAt, now)))
    .returning({ id: deletionRequests.id });
  return rows.length;
}

export async function pruneRateLimitWindows(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - RATE_LIMIT_RETENTION_DAYS * DAY_MS);
  const rows = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, cutoff))
    .returning({ key: rateLimits.key });
  return rows.length;
}

export async function pruneEmailOutbox(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - EMAIL_OUTBOX_RETENTION_DAYS * DAY_MS);
  const rows = await db.delete(emailOutbox).where(lt(emailOutbox.createdAt, cutoff)).returning({ id: emailOutbox.id });
  return rows.length;
}

export async function runMaintenance(now: Date = new Date()): Promise<MaintenanceResult> {
  // Expiry/pruning first: cheap and independent of the (slower) email sends.
  const expiredModelShares = await expirePendingModelShares(now);
  const expiredDeletionRequests = await expirePendingDeletionRequests(now);
  const prunedRateLimits = await pruneRateLimitWindows(now);
  const prunedEmails = await pruneEmailOutbox(now);
  // Before the emails: finishing a confirmed deletion matters more than a low-credit reminder.
  const resumedDeletions = await resumeStalledDeletions(now);
  const deletedDemoUsers = await deleteExpiredDemoUsers(now);
  const lowCreditEmails = await sendLowCreditReminders(now);
  return {
    lowCreditEmails,
    expiredModelShares,
    expiredDeletionRequests,
    prunedRateLimits,
    prunedEmails,
    resumedDeletions,
    deletedDemoUsers,
  };
}
