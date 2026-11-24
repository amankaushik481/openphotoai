/**
 * Real account deletion (SPEC §3): provider-side models + storage + rows, in resumable steps.
 *
 *   lock          deletedAt + banned, sessions dropped, API keys + share links revoked (atomic)
 *   jobs          in-flight jobs canceled at the AI provider            (best effort)
 *   subscriptions active subscriptions canceled at the payment provider  (best effort)
 *   models        deleteModelCompletely() per identity model (provider weights + storage + rows)
 *   records       safety records anonymized, rows without FK cascade removed, user row deleted
 *                 (cascades to everything else the user owns) — one transaction
 *   storage       everything under users/<id>/ (last, so late provider outputs are caught too)
 *
 * A failed step stops the run; the report records it and the next run skips finished steps.
 */
import { and, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  apiKeys,
  emailOutbox,
  identityModels,
  jobs,
  media,
  moderationEvents,
  rateLimits,
  reports,
  session,
  shareLinks,
  subscriptions,
  trainingPhotos,
  uploads,
  user as userTable,
  verification,
  webhookEvents,
} from "@/db/schema";
import { getPaymentProvider } from "@/providers/registry";
import { AppError } from "@/server/http";
import { deleteModelCompletely } from "@/server/models/service";
import { getStorage, storageKeys } from "@/server/storage";
import { anonymizeModerationDetails } from "./anonymize";
import {
  addWarning,
  DELETION_STEPS,
  newDeletionReport,
  type DeletionReport,
  type DeletionStepName,
  type DeletionSummary,
} from "./report";

export const DELETION_BAN_REASON = "Account deletion in progress";

interface StepContext {
  userId: string;
  /** Lowercased account email (from the user row, or the deletion request once the row is gone). */
  email: string | null;
  report: DeletionReport;
}

type StepCounts = Record<string, number>;

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

/** Never let a malformed id turn into a broad storage prefix like `users//`. */
function assertSafeUserId(userId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new Error(`Refusing to delete account with unsafe id "${userId}"`);
}

async function countUserData(userId: string): Promise<DeletionSummary> {
  const [identityModelCount, trainingPhotoCount, mediaCount, uploadCount, jobCount, shareLinkCount, subscriptionCount] =
    await Promise.all([
      db.$count(identityModels, and(eq(identityModels.userId, userId), isNull(identityModels.deletedAt))),
      db.$count(trainingPhotos, eq(trainingPhotos.userId, userId)),
      db.$count(media, and(eq(media.userId, userId), isNull(media.deletedAt))),
      db.$count(uploads, eq(uploads.userId, userId)),
      db.$count(jobs, eq(jobs.userId, userId)),
      db.$count(shareLinks, eq(shareLinks.userId, userId)),
      db.$count(subscriptions, and(eq(subscriptions.userId, userId), ne(subscriptions.status, "canceled"))),
    ]);
  return {
    identityModels: identityModelCount,
    trainingPhotos: trainingPhotoCount,
    media: mediaCount,
    uploads: uploadCount,
    jobs: jobCount,
    shareLinks: shareLinkCount,
    subscriptions: subscriptionCount,
  };
}

/** Make the account unusable before anything is removed (no half-deleted user can sign in). */
async function lockAccount({ userId, report }: StepContext): Promise<StepCounts> {
  report.summary ??= await countUserData(userId);
  const now = new Date();
  return db.transaction(async (tx) => {
    const locked = await tx
      .update(userTable)
      .set({ deletedAt: now, banned: true, banReason: DELETION_BAN_REASON, banExpires: null })
      .where(eq(userTable.id, userId))
      .returning({ id: userTable.id });
    const sessions = await tx.delete(session).where(eq(session.userId, userId)).returning({ id: session.id });
    const keys = await tx
      .update(apiKeys)
      .set({ revokedAt: now })
      .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id });
    const links = await tx
      .update(shareLinks)
      .set({ revokedAt: now })
      .where(and(eq(shareLinks.userId, userId), isNull(shareLinks.revokedAt)))
      .returning({ id: shareLinks.id });
    return { users: locked.length, sessions: sessions.length, apiKeys: keys.length, shareLinks: links.length };
  });
}

/** Stop provider-side work on the user's photos (cancelJob also refunds; the ledger goes with the user). */
async function cancelActiveJobs({ userId, report }: StepContext): Promise<StepCounts> {
  const active = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), inArray(jobs.status, ["queued", "running"])));
  if (active.length === 0) return { canceled: 0, failed: 0 };
  let canceled = 0;
  try {
    // Lazy: the job engine pulls in every handler and provider; only needed when jobs are in flight.
    const { cancelJob } = await import("@/server/jobs/engine");
    for (const job of active) {
      try {
        await cancelJob(userId, job.id);
        canceled++;
      } catch (err) {
        addWarning(report, `job ${job.id}: ${errorMessage(err)}`);
      }
    }
  } catch (err) {
    addWarning(report, `jobs: ${errorMessage(err)}`);
  }
  return { canceled, failed: active.length - canceled };
}

async function cancelSubscriptions({ userId, report }: StepContext): Promise<StepCounts> {
  const subs = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), ne(subscriptions.status, "canceled")));
  let canceled = 0;
  for (const sub of subs) {
    try {
      const provider = getPaymentProvider();
      if (provider.name !== sub.provider) {
        throw new Error(`it belongs to "${sub.provider}" but the configured payment provider is "${provider.name}"`);
      }
      await provider.cancelSubscription(sub.providerSubscriptionId);
      await db
        .update(subscriptions)
        .set({ status: "canceled", cancelAtPeriodEnd: false })
        .where(and(eq(subscriptions.id, sub.id), eq(subscriptions.userId, userId)));
      canceled++;
    } catch (err) {
      const message = `subscription ${sub.providerSubscriptionId} could not be canceled: ${errorMessage(err)}`;
      // Operators must cancel it by hand, or a deleted user keeps getting billed.
      console.error(`[account] deleting ${userId}: ${message}`);
      addWarning(report, message);
    }
  }
  return { canceled, failed: subs.length - canceled };
}

/**
 * Provider-side weights + storage + rows for every identity model. A model that couldn't be deleted
 * blocks (a retry resumes); weights the AI provider refused to delete are reported as a warning
 * (deleteModelCompletely continues past them and the row is gone, so there's nothing to retry).
 */
async function deleteModels({ userId, report }: StepContext): Promise<StepCounts> {
  const models = await db
    .select({ id: identityModels.id })
    .from(identityModels)
    .where(eq(identityModels.userId, userId));
  const failures: string[] = [];
  let deleted = 0;
  let providerFailures = 0;
  for (const model of models) {
    try {
      const result = await deleteModelCompletely(userId, model.id, { notify: false });
      deleted++;
      if (!result.providerDeleted) {
        providerFailures++;
        const message = `model ${model.id}: provider-side weights not deleted (${result.providerError ?? "unknown error"})`;
        console.error(`[account] deleting ${userId}: ${message}`);
        addWarning(report, message);
      }
    } catch (err) {
      // Already deleted (e.g. by an earlier, interrupted run): nothing left to do.
      if (err instanceof AppError && err.code === "not_found") {
        deleted++;
        continue;
      }
      failures.push(`${model.id}: ${errorMessage(err)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`couldn't delete ${failures.length} identity model(s) — ${failures.join("; ")}`);
  }
  return { deleted, providerFailures };
}

/** `position(needle in haystack) > 0` (no LIKE wildcards to escape). */
function contains(haystack: SQL, needle: string): SQL {
  return sql`position(${needle} in ${haystack}) > 0`;
}

/** Anonymize what must outlive the account, delete what has no FK cascade, then the user row. */
async function deleteRecords({ userId, email }: StepContext): Promise<StepCounts> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ stripeCustomerId: userTable.stripeCustomerId })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    // Safety audit trail: kept, but without the user's id, words or content.
    const events = await tx
      .select({ id: moderationEvents.id, details: moderationEvents.details })
      .from(moderationEvents)
      .where(eq(moderationEvents.userId, userId));
    for (const event of events) {
      await tx
        .update(moderationEvents)
        .set({ userId: null, details: anonymizeModerationDetails(event.details) })
        .where(eq(moderationEvents.id, event.id));
    }

    // Reports the user filed lose their address and text; reports about their content stay for audits.
    await tx
      .update(reports)
      .set({ reporterUserId: null, reporterEmail: null, details: null })
      .where(eq(reports.reporterUserId, userId));
    if (email) {
      await tx.update(reports).set({ reporterEmail: null }).where(sql`lower(${reports.reporterEmail}) = ${email}`);
    }

    // No FK to user: email copies, pending magic links, rate-limit counters, provider webhook payloads.
    const emails = await tx
      .delete(emailOutbox)
      .where(email ? or(eq(emailOutbox.userId, userId), sql`lower(${emailOutbox.to}) = ${email}`) : eq(emailOutbox.userId, userId))
      .returning({ id: emailOutbox.id });
    if (email) await tx.delete(verification).where(contains(sql`lower(${verification.value})`, JSON.stringify(email)));
    const limiterSuffix = `:user:${userId}`;
    await tx.delete(rateLimits).where(sql`right(${rateLimits.key}, ${limiterSuffix.length}) = ${limiterSuffix}`);
    const needles = [userId, email, row?.stripeCustomerId].filter((n): n is string => Boolean(n));
    const payloads = await tx
      .update(webhookEvents)
      .set({ payload: null })
      .where(
        and(
          isNotNull(webhookEvents.processedAt),
          or(...needles.map((needle) => contains(sql`${webhookEvents.payload}::text`, needle))),
        ),
      )
      .returning({ eventId: webhookEvents.eventId });

    // Cascades: sessions, accounts, models, photos, consents, shares, jobs, batches, media, uploads,
    // folders, share links, ledger, payments, subscriptions, API keys, owned teams, memberships.
    const users = await tx.delete(userTable).where(eq(userTable.id, userId)).returning({ id: userTable.id });
    return {
      users: users.length,
      moderationEvents: events.length,
      emails: emails.length,
      webhookPayloads: payloads.length,
    };
  });
}

async function deleteStorage({ userId }: StepContext): Promise<StepCounts> {
  const objects = await getStorage().deletePrefix(storageKeys.userPrefix(userId));
  return { objects };
}

const STEP_RUNNERS: Record<DeletionStepName, (ctx: StepContext) => Promise<StepCounts>> = {
  lock: lockAccount,
  jobs: cancelActiveJobs,
  subscriptions: cancelSubscriptions,
  models: deleteModels,
  records: deleteRecords,
  storage: deleteStorage,
};

export interface DeleteAccountOptions {
  /** Report of an earlier, interrupted run: finished steps are skipped. */
  previous?: DeletionReport | null;
  /** Account email, used when the user row is already gone (resumed runs). */
  email?: string | null;
}

/**
 * Delete the account and everything it owns. Never throws for a failed step: the returned report
 * says which step failed (`report.error`); call again with `previous: report` to resume.
 */
export async function deleteAccountCompletely(userId: string, opts: DeleteAccountOptions = {}): Promise<DeletionReport> {
  assertSafeUserId(userId);
  const now = new Date();
  const report: DeletionReport = opts.previous ? structuredClone(opts.previous) : newDeletionReport(now);
  report.attempts += 1;
  report.lastAttemptAt = now.toISOString();
  delete report.error;

  const [row] = await db.select({ email: userTable.email }).from(userTable).where(eq(userTable.id, userId)).limit(1);
  const email = (row?.email ?? opts.email)?.trim().toLowerCase() || null;
  const ctx: StepContext = { userId, email, report };

  for (const step of DELETION_STEPS) {
    if (report.steps[step]?.status === "done") continue;
    try {
      const counts = await STEP_RUNNERS[step](ctx);
      report.steps[step] = { status: "done", at: new Date().toISOString(), counts };
    } catch (err) {
      const message = errorMessage(err);
      report.steps[step] = { status: "failed", at: new Date().toISOString(), error: message };
      report.error = `${step}: ${message}`;
      console.error(`[account] deletion of ${userId} stopped at "${step}": ${message}`);
      return report;
    }
  }
  report.finishedAt = new Date().toISOString();
  return report;
}
