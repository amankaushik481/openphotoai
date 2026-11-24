/**
 * Credit ledger. CONTRACT FILE (owner: platform-core).
 *
 * Invariants:
 *  - user.credits == SUM(credit_ledger.delta) for the user, always (updated in one transaction).
 *  - Every entry has a unique idempotencyKey; re-applying the same key is a no-op that returns applied=false.
 *  - A debit never makes the balance negative (throws AppError insufficient_credits), except
 *    reason "purchase_reversal" which may (refund/chargeback after spending).
 */
import type { Database, Tx } from "@/db";
import type { CreditReason } from "@/types/domain";
import type { CreditLedgerEntryDTO } from "@/types/domain";

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

export async function applyCredit(
  input: ApplyCreditInput,
  tx?: Database | Tx,
): Promise<{ applied: boolean; balance: number }> {
  void input;
  void tx;
  throw new Error("not implemented: applyCredit (platform-core)");
}

export async function getBalance(userId: string): Promise<number> {
  void userId;
  throw new Error("not implemented: getBalance (platform-core)");
}

/** Debit for a job. idempotencyKey = `job:${jobId}:debit`. */
export async function debitForJob(
  args: { userId: string; jobId: string; amount: number },
  tx?: Database | Tx,
): Promise<{ balance: number }> {
  void args;
  void tx;
  throw new Error("not implemented: debitForJob (platform-core)");
}

/**
 * Refund (part of) a job's charge. idempotencyKey = `job:${jobId}:refund:${tag}`.
 * Also increments jobs.creditsRefunded. Never refunds more than creditsCharged - creditsRefunded.
 */
export async function refundJob(jobId: string, opts?: { amount?: number; tag?: string; note?: string }): Promise<{ refunded: number }> {
  void jobId;
  void opts;
  throw new Error("not implemented: refundJob (platform-core)");
}

export async function listLedger(
  userId: string,
  opts?: { limit?: number; cursor?: string },
): Promise<{ entries: CreditLedgerEntryDTO[]; nextCursor: string | null }> {
  void userId;
  void opts;
  throw new Error("not implemented: listLedger (platform-core)");
}
