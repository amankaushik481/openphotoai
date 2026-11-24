/** Read helpers for jobs: DTO mapping (batched media loading) + cursor pagination. */
import { and, desc, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { jobs, media } from "@/db/schema";
import type { JobRow, MediaRow } from "@/db/types";
import { errors } from "@/server/http";
import { toMediaDTO } from "@/server/media/service";
import { JOB_STATUSES, JOB_TYPES, type JobDTO } from "@/types/domain";

/** Visible outputs first, best overall score first. */
function byBestShot(a: MediaRow, b: MediaRow): number {
  if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
  return (b.scores?.overall ?? 0) - (a.scores?.overall ?? 0) || a.createdAt.getTime() - b.createdAt.getTime();
}

/** JobDTOs for many jobs with one media query. */
export async function toJobDTOs(rows: JobRow[]): Promise<JobDTO[]> {
  if (!rows.length) return [];
  const mediaRows = await db
    .select()
    .from(media)
    .where(
      and(
        inArray(
          media.jobId,
          rows.map((r) => r.id),
        ),
        // Jobs in one call may belong to one user only in practice; filter per-row below as well.
        inArray(media.userId, [...new Set(rows.map((r) => r.userId))]),
        isNull(media.deletedAt),
        isNull(media.removedAt),
      ),
    );
  const byJob = new Map<string, MediaRow[]>();
  for (const m of mediaRows) {
    const list = byJob.get(m.jobId!) ?? [];
    list.push(m);
    byJob.set(m.jobId!, list);
  }
  return Promise.all(
    rows.map(async (job) => {
      const own = (byJob.get(job.id) ?? []).filter((m) => m.userId === job.userId).sort(byBestShot);
      return {
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        error: job.error,
        errorCode: job.errorCode,
        creditsCharged: job.creditsCharged,
        creditsRefunded: job.creditsRefunded,
        modelId: job.modelId,
        packId: job.packId,
        batchId: job.batchId,
        input: job.input,
        media: await Promise.all(own.map(toMediaDTO)),
        blockedCount: typeof job.output?.blockedCount === "number" ? job.output.blockedCount : 0,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString() ?? null,
      };
    }),
  );
}

export const listJobsQuery = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  type: z.enum(JOB_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
  /** Comma-separated job ids (e.g. a page polling a few jobs at once). */
  ids: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50) : undefined)),
});
export type ListJobsQuery = z.infer<typeof listJobsQuery>;

function encodeCursor(row: Pick<JobRow, "createdAt" | "id">): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const createdAt = new Date(iso ?? "");
  if (!id || Number.isNaN(createdAt.getTime())) throw errors.validation("Invalid cursor.");
  return { createdAt, id };
}

/** Postgres keeps microseconds but JS Dates (and so cursors) keep milliseconds: compare at ms precision. */
const createdMs = sql`date_trunc('milliseconds', ${jobs.createdAt})`;

/** Newest-first page of the user's jobs. */
export async function listJobsForUser(userId: string, q: ListJobsQuery): Promise<{ jobs: JobRow[]; nextCursor: string | null }> {
  const conds: (SQL | undefined)[] = [eq(jobs.userId, userId)];
  if (q.status) conds.push(eq(jobs.status, q.status));
  if (q.type) conds.push(eq(jobs.type, q.type));
  if (q.ids?.length) conds.push(inArray(jobs.id, q.ids));
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    conds.push(or(sql`${createdMs} < ${c.createdAt}`, and(sql`${createdMs} = ${c.createdAt}`, lt(jobs.id, c.id))));
  }
  const rows = await db
    .select()
    .from(jobs)
    .where(and(...conds))
    .orderBy(desc(createdMs), desc(jobs.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return { jobs: page, nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!) : null };
}
