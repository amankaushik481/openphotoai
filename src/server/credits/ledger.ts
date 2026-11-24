/**
 * Credit ledger. CONTRACT FILE (owner: platform-core).
 *
 * Invariants:
 *  - user.credits == SUM(credit_ledger.delta) for the user, always (updated in one transaction).
 *  - Every entry has a unique idempotencyKey; re-applying the same key is a no-op that returns applied=false.
 *  - A debit never makes the balance negative (throws AppError insufficient_credits), except
 *    reason "purchase_reversal" which may (refund/chargeback after spending).
 *
 * Concurrency: every write locks the user row (`SELECT ... FOR UPDATE`) before reading the
 * balance, so parallel debits for one user are serialized and can never overdraw.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Database, type Tx } from "@/db";
import { creditLedger, jobs, user } from "@/db/schema";
import type { CreditLedgerRow } from "@/db/types";
import { newId } from "@/lib/ids";
import { errors } from "@/server/http";
import type { CreditLedgerEntryDTO, CreditReason } from "@/types/domain";

export interface ApplyCreditInput {
  userId: string;
  /** Positive = grant, negative = debit. */
  delta: number;
  reason: CreditReason;
  idempotencyKey: string;
  jobId?: string | null;
  paymentId?: string | null;
  note?: string | null;
  /** Admin user id for manual adjustments. */
  createdBy?: string | null;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function assertIntegerAmount(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) throw errors.validation(`${what} must be an integer (got ${value}).`);
}

/**
 * Apply a ledger entry and update the cached balance atomically.
 *
 * When `tx` is given (e.g. the job engine inserting a job and debiting in one transaction) the
 * work runs in a savepoint inside it, so a failure here aborts the caller's transaction too.
 * A zero delta writes nothing and returns `{ applied: false }` with the current balance.
 */
export async function applyCredit(
  input: ApplyCreditInput,
  tx?: Database | Tx,
): Promise<{ applied: boolean; balance: number }> {
  assertIntegerAmount(input.delta, "Credit delta");
  if (!input.idempotencyKey) throw errors.validation("Credit entries need an idempotency key.");

  return (tx ?? db).transaction(async (t) => {
    const [owner] = await t
      .select({ credits: user.credits })
      .from(user)
      .where(eq(user.id, input.userId))
      .for("update");
    if (!owner) throw errors.notFound("User");

    if (input.delta === 0) return { applied: false, balance: owner.credits };

    const [existing] = await t
      .select({ userId: creditLedger.userId })
      .from(creditLedger)
      .where(eq(creditLedger.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) {
      if (existing.userId !== input.userId) throw errors.conflict("Idempotency key already used for another account.");
      return { applied: false, balance: owner.credits };
    }

    const balanceAfter = owner.credits + input.delta;
    if (input.delta < 0 && balanceAfter < 0 && input.reason !== "purchase_reversal") {
      throw errors.insufficientCredits(-input.delta, owner.credits);
    }

    await t.insert(creditLedger).values({
      userId: input.userId,
      delta: input.delta,
      balanceAfter,
      reason: input.reason,
      jobId: input.jobId ?? null,
      paymentId: input.paymentId ?? null,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
      idempotencyKey: input.idempotencyKey,
      // Wall-clock time (not transaction start) keeps entries written in one transaction ordered.
      createdAt: sql`clock_timestamp()`,
    });
    await t.update(user).set({ credits: balanceAfter }).where(eq(user.id, input.userId));
    return { applied: true, balance: balanceAfter };
  });
}

export async function getBalance(userId: string): Promise<number> {
  const [row] = await db.select({ credits: user.credits }).from(user).where(eq(user.id, userId)).limit(1);
  if (!row) throw errors.notFound("User");
  return row.credits;
}

/** Debit for a job. idempotencyKey = `job:${jobId}:debit`. Free jobs (amount 0) write nothing. */
export async function debitForJob(
  args: { userId: string; jobId: string; amount: number },
  tx?: Database | Tx,
): Promise<{ balance: number }> {
  assertIntegerAmount(args.amount, "Job cost");
  if (args.amount < 0) throw errors.validation("Job cost cannot be negative.");
  const { balance } = await applyCredit(
    {
      userId: args.userId,
      delta: -args.amount,
      reason: "job_debit",
      jobId: args.jobId,
      idempotencyKey: `job:${args.jobId}:debit`,
    },
    tx,
  );
  return { balance };
}

/**
 * Refund (part of) a job's charge. idempotencyKey = `job:${jobId}:refund:${tag}`.
 * Also increments jobs.creditsRefunded. Never refunds more than creditsCharged - creditsRefunded.
 * `opts.amount` defaults to everything still refundable; `opts.tag` defaults to "full".
 * `opts.createdBy` attributes the ledger entry to an admin (manual refunds).
 * Pass `tx` to refund inside the caller's transaction (e.g. while it holds the job row).
 */
export async function refundJob(
  jobId: string,
  opts?: { amount?: number; tag?: string; note?: string; createdBy?: string | null },
  tx?: Database | Tx,
): Promise<{ refunded: number }> {
  if (opts?.amount !== undefined) assertIntegerAmount(opts.amount, "Refund amount");
  const tag = opts?.tag ?? "full";

  return (tx ?? db).transaction(async (t) => {
    const [job] = await t
      .select({ userId: jobs.userId, charged: jobs.creditsCharged, refunded: jobs.creditsRefunded })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .for("update");
    if (!job) throw errors.notFound("Job");

    const refundable = Math.max(0, job.charged - job.refunded);
    const amount = Math.min(Math.max(0, opts?.amount ?? refundable), refundable);
    if (amount === 0) return { refunded: 0 };

    const { applied } = await applyCredit(
      {
        userId: job.userId,
        delta: amount,
        reason: "job_refund",
        jobId,
        note: opts?.note ?? null,
        createdBy: opts?.createdBy ?? null,
        idempotencyKey: `job:${jobId}:refund:${tag}`,
      },
      t,
    );
    if (!applied) return { refunded: 0 };

    await t
      .update(jobs)
      .set({ creditsRefunded: sql`${jobs.creditsRefunded} + ${amount}` })
      .where(eq(jobs.id, jobId));
    return { refunded: amount };
  });
}

function toLedgerDTO(row: CreditLedgerRow): CreditLedgerEntryDTO {
  return {
    id: row.id,
    delta: row.delta,
    balanceAfter: row.balanceAfter,
    reason: row.reason,
    jobId: row.jobId,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Newest first (createdAt desc, id desc). `cursor` is the id of the last entry of the previous
 * page; the comparison happens in SQL so microsecond timestamps never skip or repeat rows.
 */
export async function listLedger(
  userId: string,
  opts?: { limit?: number; cursor?: string },
): Promise<{ entries: CreditLedgerEntryDTO[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(Math.trunc(opts?.limit ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const conditions = [eq(creditLedger.userId, userId)];
  if (opts?.cursor) {
    const after = alias(creditLedger, "cursor_entry");
    const cursorRow = db
      .select({ createdAt: after.createdAt, id: after.id })
      .from(after)
      .where(and(eq(after.id, opts.cursor), eq(after.userId, userId)));
    conditions.push(sql`(${creditLedger.createdAt}, ${creditLedger.id}) < (${cursorRow})`);
  }

  const rows = await db
    .select()
    .from(creditLedger)
    .where(and(...conditions))
    .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  return {
    entries: page.map(toLedgerDTO),
    nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
  };
}

/** Grant credits (signup bonus, purchases, plan grants, transfers). `amount` must be positive. */
export async function grantCredits(
  userId: string,
  amount: number,
  reason: CreditReason,
  idempotencyKey: string,
  note?: string | null,
): Promise<{ applied: boolean; balance: number }> {
  assertIntegerAmount(amount, "Credit amount");
  if (amount <= 0) throw errors.validation("Granted credits must be positive.");
  return applyCredit({ userId, delta: amount, reason, idempotencyKey, note: note ?? null });
}

/**
 * Manual admin adjustment (either sign), recorded with the admin's id and a required note.
 * Cannot take a balance below zero. Pass `idempotencyKey` to make a retried request safe.
 */
export async function adminAdjust(
  adminId: string,
  userId: string,
  delta: number,
  note: string,
  idempotencyKey?: string,
): Promise<{ applied: boolean; balance: number }> {
  assertIntegerAmount(delta, "Credit delta");
  if (delta === 0) throw errors.validation("Adjustment must be non-zero.");
  const trimmed = note.trim();
  if (!trimmed) throw errors.validation("A note is required for manual credit adjustments.");
  return applyCredit({
    userId,
    delta,
    reason: "admin_adjust",
    note: trimmed,
    createdBy: adminId,
    idempotencyKey: idempotencyKey ?? `admin:${adminId}:${newId("adj")}`,
  });
}
