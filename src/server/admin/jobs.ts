/** Admin job views + manual refunds. */
import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { creditLedger, jobs, media, moderationEvents, user } from "@/db/schema";
import type { CreditLedgerRow, JobRow, ModerationEventRow } from "@/db/types";
import { refundJob } from "@/server/credits/ledger";
import { errors } from "@/server/http";
import type { AIProviderName, JobStatus, JobType } from "@/types/domain";

/** Statuses after which a job never changes again (and can be refunded by hand). */
export function isTerminalJobStatus(status: JobStatus): boolean {
  return status !== "queued" && status !== "running";
}
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
export async function listJobs(
  filter: ListJobsFilter = {},
): Promise<{ jobs: AdminJobItem[]; nextCursor: string | null }> {
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
 * Throws conflict when nothing is left to refund, or while the job is still queued or running:
 * it may still succeed (a refund would make it free) or fail (it is then refunded automatically).
 */
export async function refundJobAdmin(
  adminId: string,
  jobId: string,
  note?: string | null,
): Promise<{ refunded: number; creditsRefunded: number }> {
  const [job] = await db
    .select({ charged: jobs.creditsCharged, refunded: jobs.creditsRefunded, status: jobs.status })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!job) throw errors.notFound("Job");
  if (!isTerminalJobStatus(job.status)) {
    throw errors.conflict(
      "This job is still in progress. Failed jobs are refunded automatically; refund it once it has finished.",
    );
  }
  if (job.charged - job.refunded <= 0) throw errors.conflict("Nothing left to refund on this job.");

  const text = note?.trim() ? `Admin refund: ${note.trim()}` : "Admin refund";
  const { refunded } = await refundJob(jobId, { tag: "admin", note: text, createdBy: adminId });
  if (refunded === 0) throw errors.conflict("This job was already refunded by an admin.");

  const [after] = await db.select({ refunded: jobs.creditsRefunded }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return { refunded, creditsRefunded: after?.refunded ?? job.refunded + refunded };
}

export interface AdminJobDetail {
  /** The full job row; provider model references in `output` are redacted. */
  job: JobRow & { userEmail: string | null };
  /** Every ledger entry for this job (debit, refunds), oldest first. */
  ledger: CreditLedgerRow[];
  /** Media the job produced (removed and deleted ones included). */
  media: {
    id: string;
    kind: string;
    isDraft: boolean;
    removedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
  }[];
  /** Safety events recorded for this job, newest first. */
  events: ModerationEventRow[];
}

/** Keys of `jobs.output` that point at private provider artifacts (trained weights). */
const REDACTED_OUTPUT_KEYS = new Set(["modelRef"]);
/**
 * URLs (provider files, signed links), data URIs and storage keys: never shown, even to admins.
 * Matched anywhere in a string: provider error text (`failureDetail`) quotes signed URLs mid-sentence.
 */
const SENSITIVE_SUBSTRING = /\b(?:https?:\/\/|data:)[^\s"'<>()[\]{}]+|(?<![\w/])users\/[^\s"'<>()[\]{}]+/gi;

/** Deep copy of a job's output with weight references, URLs and storage keys replaced by "[redacted]". */
export function redactJobOutput(value: unknown, key?: string): unknown {
  if (key && REDACTED_OUTPUT_KEYS.has(key) && value) return "[redacted]";
  if (typeof value === "string") return value.replace(SENSITIVE_SUBSTRING, "[redacted]");
  if (Array.isArray(value)) return value.map((v) => redactJobOutput(v));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactJobOutput(v, k)]));
  }
  return value;
}

/** Job inspector: the job, its credits, outputs and safety events. Throws not_found. */
export async function getAdminJobDetail(jobId: string): Promise<AdminJobDetail> {
  const [row] = await db
    .select({ job: jobs, userEmail: user.email })
    .from(jobs)
    .leftJoin(user, eq(user.id, jobs.userId))
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!row) throw errors.notFound("Job");

  const [ledger, outputs, events] = await Promise.all([
    db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.jobId, jobId))
      .orderBy(asc(creditLedger.createdAt), asc(creditLedger.id)),
    db
      .select({
        id: media.id,
        kind: media.kind,
        isDraft: media.isDraft,
        removedAt: media.removedAt,
        deletedAt: media.deletedAt,
        createdAt: media.createdAt,
      })
      .from(media)
      .where(eq(media.jobId, jobId))
      .orderBy(asc(media.createdAt)),
    db
      .select()
      .from(moderationEvents)
      .where(eq(moderationEvents.jobId, jobId))
      .orderBy(desc(moderationEvents.createdAt)),
  ]);

  const output = row.job.output ? (redactJobOutput(row.job.output) as JobRow["output"]) : null;
  // API callers can pass image URLs in the input: same treatment.
  const input = redactJobOutput(row.job.input) as JobRow["input"];
  return { job: { ...row.job, input, output, userEmail: row.userEmail }, ledger, media: outputs, events };
}
