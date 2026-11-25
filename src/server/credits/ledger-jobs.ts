/**
 * What the jobs behind ledger entries were, so the credit history reads "Photo generation" instead of
 * a bare "Used" (read-only; scoped to the user's own jobs).
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import type { CreditLedgerEntryDTO, JobType } from "@/types/domain";

/** jobId → job type, for the job-linked entries of a ledger page. */
export type LedgerJobTypes = Record<string, JobType>;

export async function ledgerJobTypes(userId: string, entries: readonly CreditLedgerEntryDTO[]): Promise<LedgerJobTypes> {
  const ids = [...new Set(entries.map((e) => e.jobId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: jobs.id, type: jobs.type })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), inArray(jobs.id, ids)));
  return Object.fromEntries(rows.map((r) => [r.id, r.type]));
}
