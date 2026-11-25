/** Admin user management: search, detail view, suspension. */
import { and, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, type Database, type Tx } from "@/db";
import {
  creditLedger,
  identityModels,
  media,
  moderationEvents,
  payments,
  reports,
  session,
  shareLinks,
  subscriptions,
  user,
} from "@/db/schema";
import type {
  CreditLedgerRow,
  ModerationEventRow,
  PaymentRow,
  ReportRow,
  SubscriptionRow,
  UserRow,
} from "@/db/types";
import { sendEmailSafe } from "@/server/email";
import { errors } from "@/server/http";
import type { ModelStatus, PlanId, Subject, UserRole } from "@/types/domain";
import { listJobs, type AdminJobItem } from "./jobs";
import type { UserStatusFilter } from "./schemas";
import { afterCursor, escapeLike, num, pageSize, paginate } from "./util";

export interface AdminUserItem {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plan: PlanId;
  credits: number;
  hasPaid: boolean;
  banned: boolean;
  banReason: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

const userItemColumns = {
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  plan: user.plan,
  credits: user.credits,
  hasPaid: user.hasPaid,
  banned: user.banned,
  banReason: user.banReason,
  createdAt: user.createdAt,
  deletedAt: user.deletedAt,
};

function toUserItem(row: Omit<AdminUserItem, "banned"> & { banned: boolean | null }): AdminUserItem {
  return { ...row, banned: row.banned === true };
}

/**
 * Newest users first. `q` matches email or name (case-insensitive substring) or an exact user id.
 * `plan` / `status` narrow the list. `cursor` is the id of the last user of the previous page.
 */
export async function searchUsers(
  q?: string | null,
  cursor?: string | null,
  opts: { limit?: number; plan?: PlanId; status?: UserStatusFilter } = {},
): Promise<{ users: AdminUserItem[]; nextCursor: string | null }> {
  const limit = pageSize(opts.limit);
  const conditions: SQL[] = [];
  const term = q?.trim();
  if (term) {
    const pattern = `%${escapeLike(term)}%`;
    conditions.push(or(ilike(user.email, pattern), ilike(user.name, pattern), eq(user.id, term))!);
  }
  if (opts.plan) conditions.push(eq(user.plan, opts.plan));
  if (opts.status === "admin") conditions.push(eq(user.role, "admin"));
  if (opts.status === "suspended") conditions.push(eq(user.banned, true));
  if (opts.status === "paid") conditions.push(eq(user.hasPaid, true));
  if (opts.status === "deleted") conditions.push(isNotNull(user.deletedAt));
  if (cursor) conditions.push(afterCursor(user, user, cursor));

  const rows = await db
    .select(userItemColumns)
    .from(user)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(user.createdAt), desc(user.id))
    .limit(limit + 1);
  const page = paginate(rows, limit);
  return { users: page.items.map(toUserItem), nextCursor: page.nextCursor };
}

export interface AdminModelItem {
  id: string;
  name: string;
  subject: Subject;
  status: ModelStatus;
  mode: string | null;
  createdAt: Date;
  trainedAt: Date | null;
  deletedAt: Date | null;
}

export interface AdminUserDetail {
  user: AdminUserItem & {
    image: string | null;
    emailVerified: boolean;
    banExpires: Date | null;
    stripeCustomerId: string | null;
    locale: string;
    marketingOptIn: boolean;
  };
  balance: number;
  /** Newest 50 ledger entries (with the admin who made manual adjustments). */
  ledger: CreditLedgerRow[];
  /** Newest 50 jobs. */
  jobs: AdminJobItem[];
  models: AdminModelItem[];
  media: { total: number; removed: number };
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
  moderationEvents: ModerationEventRow[];
  /** Reports filed against this user's content. */
  reports: ReportRow[];
}

const DETAIL_LIMIT = 50;

export async function getUserDetail(userId: string): Promise<AdminUserDetail> {
  const [row] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!row) throw errors.notFound("User");

  const [ledger, jobPage, models, [mediaCounts], subs, pays, events, userReports] = await Promise.all([
    db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId))
      .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
      .limit(DETAIL_LIMIT),
    listJobs({ userId, limit: DETAIL_LIMIT }),
    db
      .select({
        id: identityModels.id,
        name: identityModels.name,
        subject: identityModels.subject,
        status: identityModels.status,
        mode: sql<string | null>`${identityModels.metadata}->>'mode'`,
        createdAt: identityModels.createdAt,
        trainedAt: identityModels.trainedAt,
        deletedAt: identityModels.deletedAt,
      })
      .from(identityModels)
      .where(eq(identityModels.userId, userId))
      .orderBy(desc(identityModels.createdAt)),
    db
      .select({ total: count(), removed: sql<number>`count(*) filter (where ${media.removedAt} is not null)` })
      .from(media)
      .where(and(eq(media.userId, userId), isNull(media.deletedAt))),
    db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.createdAt)),
    db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt))
      .limit(DETAIL_LIMIT),
    db
      .select()
      .from(moderationEvents)
      .where(eq(moderationEvents.userId, userId))
      .orderBy(desc(moderationEvents.createdAt))
      .limit(DETAIL_LIMIT),
    db
      .select()
      .from(reports)
      .where(eq(reports.targetUserId, userId))
      .orderBy(desc(reports.createdAt))
      .limit(DETAIL_LIMIT),
  ]);

  return {
    user: {
      ...toUserItem(row),
      image: row.image,
      emailVerified: row.emailVerified,
      banExpires: row.banExpires,
      stripeCustomerId: row.stripeCustomerId,
      locale: row.locale,
      marketingOptIn: row.marketingOptIn,
    },
    balance: row.credits,
    ledger,
    jobs: jobPage.jobs,
    models,
    media: { total: num(mediaCounts?.total), removed: num(mediaCounts?.removed) },
    subscriptions: subs,
    payments: pays,
    moderationEvents: events,
    reports: userReports,
  };
}

/* ───────────────────────────── suspension ───────────────────────────── */

/** Throws unless `adminId` may suspend `target` (never yourself, never another admin). */
export function assertSuspendable(adminId: string, target: Pick<UserRow, "id" | "role">): void {
  if (target.id === adminId) throw errors.forbidden("You can't suspend your own account.");
  if (target.role === "admin") throw errors.forbidden("Admins can't be suspended. Remove the admin role first.");
}

export async function loadUserOrThrow(userId: string, tx: Database | Tx = db): Promise<UserRow> {
  const [row] = await tx.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!row) throw errors.notFound("User");
  return row;
}

export interface SuspendResult {
  user: UserRow;
  /** False when the user was already suspended (nothing new happened, no email sent). */
  suspended: boolean;
  sessionsDeleted: number;
  shareLinksRevoked: number;
}

/**
 * Database part of a suspension, run inside the caller's transaction: ban the user, end every
 * session, revoke their share links and write the `account_suspended` audit event.
 * Already-suspended users are left as they are (`suspended: false`), but sessions and live
 * share links are still cleaned up.
 */
export async function suspendUserTx(
  tx: Database | Tx,
  adminId: string,
  target: UserRow,
  reason: string,
  context: Record<string, unknown> = {},
): Promise<SuspendResult> {
  assertSuspendable(adminId, target);
  const [banned] = await tx
    .update(user)
    .set({ banned: true, banReason: reason, banExpires: null })
    .where(and(eq(user.id, target.id), or(isNull(user.banned), eq(user.banned, false))))
    .returning();

  const deletedSessions = await tx.delete(session).where(eq(session.userId, target.id)).returning({ id: session.id });
  const revoked = await tx
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.userId, target.id), isNull(shareLinks.revokedAt)))
    .returning({ id: shareLinks.id });

  if (banned) {
    // Admin actions are audit entries, not work for the review queue: stored as reviewed.
    await tx.insert(moderationEvents).values({
      userId: target.id,
      kind: "account_suspended",
      reviewed: true,
      details: {
        reason,
        adminId,
        sessionsDeleted: deletedSessions.length,
        shareLinksRevoked: revoked.length,
        ...context,
      },
    });
  }

  return {
    user: banned ?? (await loadUserOrThrow(target.id, tx)),
    suspended: Boolean(banned),
    sessionsDeleted: deletedSessions.length,
    shareLinksRevoked: revoked.length,
  };
}

/** Tell the user why they were suspended (never throws). */
export async function notifySuspended(target: Pick<UserRow, "id" | "email">, reason: string): Promise<void> {
  await sendEmailSafe("account_suspended", target.email, { reason }, { userId: target.id });
}

/**
 * Suspend a user: banned + reason, every session deleted, share links revoked, an
 * `account_suspended` moderation event recorded and an email sent. Admins and yourself can't
 * be suspended. Suspending an already-suspended user changes nothing and sends no email.
 */
export async function suspendUser(adminId: string, userId: string, reason: string): Promise<SuspendResult> {
  const trimmed = reason.trim();
  if (!trimmed) throw errors.validation("A reason is required to suspend an account.");
  const target = await loadUserOrThrow(userId);
  assertSuspendable(adminId, target);

  const result = await db.transaction((tx) => suspendUserTx(tx, adminId, target, trimmed));
  if (result.suspended) await notifySuspended(target, trimmed);
  return result;
}

/**
 * Lift a suspension and write the `account_unsuspended` audit event (with the reason that was
 * lifted). Share links revoked by the suspension stay revoked. Idempotent: lifting a suspension
 * that isn't there records nothing.
 */
export async function unsuspendUser(adminId: string, userId: string): Promise<{ user: UserRow; unsuspended: boolean }> {
  const target = await loadUserOrThrow(userId);
  if (target.id === adminId) throw errors.forbidden("You can't change your own suspension.");
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(user)
      .set({ banned: false, banReason: null, banExpires: null })
      .where(and(eq(user.id, userId), eq(user.banned, true)))
      .returning();
    if (updated) {
      await tx.insert(moderationEvents).values({
        userId,
        kind: "account_unsuspended",
        reviewed: true,
        details: { adminId, previousReason: target.banReason ?? null },
      });
    }
    return { user: updated ?? target, unsuspended: Boolean(updated) };
  });
}
