/**
 * Email-confirmed account deletion:
 *
 *   requestAccountDeletion(user)   → pending row (sha256 of a random token, 24h) + confirmation email
 *   confirmAccountDeletion(token)  → pending → confirmed → deleteAccountCompletely() → completed + final email
 *
 * A confirmed request whose run failed keeps its token valid (the user is already locked out and can't
 * ask for a new link): the confirm page retries with it, and `resumeStalledDeletions()` can from a cron.
 */
import { createHash } from "node:crypto";
import { and, asc, eq, gte, ne, sql } from "drizzle-orm";
import { APP } from "@/config/app";
import { db } from "@/db";
import { deletionRequests } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { newToken } from "@/lib/ids";
import { sendEmail, sendEmailSafe } from "@/server/email";
import { AppError, errors } from "@/server/http";
import { deleteAccountCompletely } from "./delete-account";
import {
  describeDeletion,
  isDeletionFinished,
  newDeletionReport,
  parseDeletionReport,
  type DeletionReport,
} from "./report";

export const DELETION_LINK_TTL_HOURS = 24;
export const MAX_DELETION_REQUESTS_PER_DAY = 3;
/** A run holding the lease longer than this is presumed dead and may be resumed. */
const RUN_LEASE_MS = 10 * 60_000;
const DAY_MS = 86_400_000;

export type DeletionConfirmStatus = "completed" | "in_progress";

export function hashDeletionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function deletionConfirmUrl(token: string): string {
  return `${APP.url}/account/delete/confirm?token=${encodeURIComponent(token)}`;
}

function invalidLink(): AppError {
  return new AppError("not_found", "This deletion link is invalid or was replaced by a newer one.", { reason: "invalid" });
}

function expiredLink(): AppError {
  return new AppError("not_found", "This deletion link has expired. Request a new one from Settings.", {
    reason: "expired",
  });
}

function incompleteDeletion(): AppError {
  return new AppError(
    "provider_error",
    "We couldn't finish deleting everything yet. You're signed out and nothing is visible anymore — please try again in a minute.",
    { reason: "incomplete" },
  );
}

/** What a completed request keeps of the address: enough for support to confirm a deletion, nothing more. */
function anonymizedEmail(email: string): string {
  return `sha256:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`;
}

/**
 * Create a deletion request and email the confirmation link. At most 3 per user per 24h; an earlier
 * pending request is superseded once the new email has been sent.
 */
export async function requestAccountDeletion(
  user: Pick<UserRow, "id" | "email">,
): Promise<{ requestId: string; expiresAt: Date }> {
  const now = new Date();
  const recent = await db
    .select({ createdAt: deletionRequests.createdAt })
    .from(deletionRequests)
    .where(and(eq(deletionRequests.userId, user.id), gte(deletionRequests.createdAt, new Date(now.getTime() - DAY_MS))))
    .orderBy(asc(deletionRequests.createdAt));
  if (recent.length >= MAX_DELETION_REQUESTS_PER_DAY) {
    const resetAt = recent[0]!.createdAt.getTime() + DAY_MS;
    throw errors.rateLimited(Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)));
  }

  const token = newToken();
  const expiresAt = new Date(now.getTime() + DELETION_LINK_TTL_HOURS * 3600_000);
  const [created] = await db
    .insert(deletionRequests)
    .values({ userId: user.id, email: user.email.trim().toLowerCase(), tokenHash: hashDeletionToken(token), expiresAt })
    .returning({ id: deletionRequests.id });
  const requestId = created!.id;

  try {
    await sendEmail(
      "deletion_confirm_request",
      user.email,
      { url: deletionConfirmUrl(token), expiresInHours: DELETION_LINK_TTL_HOURS },
      { userId: user.id },
    );
  } catch (err) {
    // The user never got this link: don't let it count against them or linger as pending.
    await db.delete(deletionRequests).where(eq(deletionRequests.id, requestId));
    throw err;
  }

  await db
    .update(deletionRequests)
    .set({ status: "expired" })
    .where(
      and(
        eq(deletionRequests.userId, user.id),
        eq(deletionRequests.status, "pending"),
        ne(deletionRequests.id, requestId),
      ),
    );
  return { requestId, expiresAt };
}

async function loadRequest(id: string) {
  const [row] = await db.select().from(deletionRequests).where(eq(deletionRequests.id, id)).limit(1);
  return row;
}

/** Status of a request that another run is (or was just) working on. */
async function statusOfBusyRequest(id: string): Promise<{ status: DeletionConfirmStatus }> {
  const current = await loadRequest(id);
  if (current?.status === "completed") return { status: "completed" };
  if (current?.status === "confirmed") return { status: "in_progress" };
  throw invalidLink();
}

/** Run (or resume) the deletion of a confirmed request under a lease. */
async function runConfirmedDeletion(requestId: string): Promise<{ status: DeletionConfirmStatus }> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + RUN_LEASE_MS).toISOString();
  const [claimed] = await db
    .update(deletionRequests)
    .set({
      report: sql`coalesce(${deletionRequests.report}, '{}'::jsonb) || jsonb_build_object('leaseUntil', ${leaseUntil}::text)`,
    })
    .where(
      and(
        eq(deletionRequests.id, requestId),
        eq(deletionRequests.status, "confirmed"),
        sql`coalesce((${deletionRequests.report}->>'leaseUntil')::timestamptz, 'epoch'::timestamptz) < ${now.toISOString()}::timestamptz`,
      ),
    )
    .returning();
  if (!claimed) return statusOfBusyRequest(requestId);

  const previous = parseDeletionReport(claimed.report);
  let report: DeletionReport;
  try {
    report = await deleteAccountCompletely(claimed.userId, { previous, email: claimed.email });
  } catch (err) {
    // Unexpected (not a step failure): release the lease so the user can retry right away.
    const failed = previous ?? newDeletionReport(now);
    failed.error = err instanceof Error ? err.message : String(err);
    await db
      .update(deletionRequests)
      .set({ report: { ...failed, leaseUntil: null } })
      .where(eq(deletionRequests.id, requestId));
    throw err;
  }
  report.leaseUntil = null;

  if (!isDeletionFinished(report)) {
    await db.update(deletionRequests).set({ report }).where(eq(deletionRequests.id, requestId));
    throw incompleteDeletion();
  }

  await db
    .update(deletionRequests)
    .set({ status: "completed", completedAt: new Date(), report })
    .where(eq(deletionRequests.id, requestId));
  // Never throws; not tied to the (deleted) user id.
  await sendEmailSafe("deletion_completed", claimed.email, { summary: describeDeletion(report.summary) });
  await db
    .update(deletionRequests)
    .set({ email: anonymizedEmail(claimed.email) })
    .where(eq(deletionRequests.id, requestId));
  return { status: "completed" };
}

/**
 * Confirm a deletion with the emailed token and execute it. Idempotent: a completed request answers
 * "completed" again, a run in progress "in_progress". Throws not_found (details.reason "invalid" |
 * "expired") for unusable links and provider_error (details.reason "incomplete") when a step failed.
 */
export async function confirmAccountDeletion(token: string): Promise<{ status: DeletionConfirmStatus }> {
  const trimmed = token.trim();
  if (!trimmed) throw invalidLink();
  const [request] = await db
    .select()
    .from(deletionRequests)
    .where(eq(deletionRequests.tokenHash, hashDeletionToken(trimmed)))
    .limit(1);
  if (!request || request.status === "expired") throw invalidLink();
  if (request.status === "completed") return { status: "completed" };

  if (request.status === "pending") {
    const now = new Date();
    if (request.expiresAt.getTime() <= now.getTime()) {
      await db
        .update(deletionRequests)
        .set({ status: "expired" })
        .where(and(eq(deletionRequests.id, request.id), eq(deletionRequests.status, "pending")));
      throw expiredLink();
    }
    // Conditional: a concurrent supersede/confirm wins; the run below re-checks the status.
    await db
      .update(deletionRequests)
      .set({ status: "confirmed", confirmedAt: now })
      .where(and(eq(deletionRequests.id, request.id), eq(deletionRequests.status, "pending")));
  }
  return runConfirmedDeletion(request.id);
}

/**
 * For a maintenance cron: resume confirmed deletions whose last run failed or died (lease expired).
 * Returns how many were completed.
 */
export async function resumeStalledDeletions(now: Date = new Date(), limit = 5): Promise<number> {
  const stalled = await db
    .select({ id: deletionRequests.id })
    .from(deletionRequests)
    .where(
      and(
        eq(deletionRequests.status, "confirmed"),
        sql`coalesce((${deletionRequests.report}->>'leaseUntil')::timestamptz, 'epoch'::timestamptz) < ${now.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(asc(deletionRequests.confirmedAt))
    .limit(limit);
  let completed = 0;
  for (const { id } of stalled) {
    try {
      if ((await runConfirmedDeletion(id)).status === "completed") completed++;
    } catch (err) {
      console.error(`[account] resuming deletion ${id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return completed;
}
