/** Admin job views + manual refunds. */
import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { creditLedger, jobs, user } from "@/db/schema";
import { refundJob } from "@/server/credits/ledger";
import { errors } from "@/server/http";
import type { AIProviderName, JobStatus, JobType } from "@/types/domain";
import { afterCursor, pageSize, paginate } from "./util";

export interface AdminJobItem {
  id: string;
  userId: string;
  userEmail: string | null;
  type: JobType;
  status: JobStatus;
  provider: AIProviderName | null;
  providerEndpoint: string | null;
  error: string | null;
  errorCode: string | null;
  creditsCharged: number;
  creditsRefunded: number;
  costUsd: number;
  modelId: string | null;
  batchId: string | null;
  createdAt: Date;
  submittedAt: Date | null;
  completedAt: Date | null;
}

export interface ListJobsFilter {
  status?: JobStatus;
  type?: JobType;
  userId?: string;
  cursor?: string;
  limit?: number;
}

/** Newest first, across all users. `cursor` is the id of the last job of the previous page. */
export async function listJobs(filter: ListJobsFilter = {}): Promise<{ jobs: AdminJobItem[]; nextCursor: string | null }> {
  const limit = pageSize(filter.limit);
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(jobs.status, filter.status));
  if (filter.type) conditions.push(eq(jobs.type, filter.type));
  if (filter.userId) conditions.push(eq(jobs.userId, filter.userId));
  if (filter.cursor) conditions.push(afterCursor(jobs, jobs, filter.cursor));

  const rows = await db
    .select({
      id: jobs.id,
      userId: jobs.userId,
      userEmail: user.email,
      type: jobs.type,
      status: jobs.status,
      provider: jobs.provider,
      providerEndpoint: jobs.providerEndpoint,
      error: jobs.error,
      errorCode: jobs.errorCode,
      creditsCharged: jobs.creditsCharged,
      creditsRefunded: jobs.creditsRefunded,
      costUsd: jobs.costUsd,
      modelId: jobs.modelId,
      batchId: jobs.batchId,
      createdAt: jobs.createdAt,
      submittedAt: jobs.submittedAt,
      completedAt: jobs.completedAt,
    })
    .from(jobs)
    .leftJoin(user, eq(user.id, jobs.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(limit + 1);

  const page = paginate(rows, limit);
  return { jobs: page.items, nextCursor: page.nextCursor };
}

/**
 * Refund everything still refundable on a job (creditsCharged − creditsRefunded) as an admin
 * goodwill refund (ledger idempotency tag "admin"; the ledger entry records the admin).
 * Throws conflict when nothing is left to refund.
 */
export async function refundJobAdmin(
  adminId: string,
  jobId: string,
  note?: string | null,
): Promise<{ refunded: number; creditsRefunded: number }> {
  const [job] = await db
    .select({ charged: jobs.creditsCharged, refunded: jobs.creditsRefunded })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!job) throw errors.notFound("Job");
  if (job.charged - job.refunded <= 0) throw errors.conflict("Nothing left to refund on this job.");

  const text = note?.trim() ? `Admin refund: ${note.trim()}` : "Admin refund";
  const refunded = await db.transaction(async (tx) => {
    const result = await refundJob(jobId, { tag: "admin", note: text }, tx);
    if (result.refunded > 0) {
      // Attribute the entry written just above (same transaction) to the admin.
      await tx
        .update(creditLedger)
        .set({ createdBy: adminId })
        .where(and(eq(creditLedger.idempotencyKey, `job:${jobId}:refund:admin`), isNull(creditLedger.createdBy)));
    }
    return result.refunded;
  });
  if (refunded === 0) throw errors.conflict("This job was already refunded by an admin.");

  const [after] = await db.select({ refunded: jobs.creditsRefunded }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return { refunded, creditsRefunded: after?.refunded ?? job.refunded + refunded };
}
