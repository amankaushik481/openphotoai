/**
 * Batch bookkeeping. Counters are bumped in the SAME transaction as a child job's terminal status
 * transition (which happens exactly once thanks to conditional updates), so they never drift.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, type Database, type Tx } from "@/db";
import { batches } from "@/db/schema";
import type { BatchRow } from "@/db/types";
import { errors } from "@/server/http";
import type { BatchStatus, JobStatus } from "@/types/domain";

export interface BatchDTO {
  id: string;
  modelId: string | null;
  packId: string | null;
  brandKitId: string | null;
  total: number;
  completed: number;
  failed: number;
  status: BatchStatus;
  createdAt: string;
  updatedAt: string;
}

export function toBatchDTO(row: BatchRow): BatchDTO {
  return {
    id: row.id,
    modelId: row.modelId,
    packId: row.packId,
    brandKitId: row.brandKitId,
    total: row.total,
    completed: row.completed,
    failed: row.failed,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getBatchForUser(userId: string, batchId: string): Promise<BatchRow> {
  const [row] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.id, batchId), eq(batches.userId, userId)))
    .limit(1);
  if (!row) throw errors.notFound("Batch");
  return row;
}

/**
 * Count a child job that just reached a terminal status. Column references on the right-hand side
 * of SET see the pre-update row, so the status check uses old counters + this job.
 */
export async function bumpBatchCounters(tx: Database | Tx, batchId: string, status: JobStatus): Promise<void> {
  const ok = status === "succeeded" ? 1 : 0;
  const bad = 1 - ok;
  await tx
    .update(batches)
    .set({
      completed: sql`${batches.completed} + ${ok}::int`,
      failed: sql`${batches.failed} + ${bad}::int`,
      status: sql`case when ${batches.status} = 'running' and ${batches.completed} + ${batches.failed} + 1 >= ${batches.total}
        then (case when ${batches.completed} + ${ok}::int > 0 then 'completed' else 'failed' end)
        else ${batches.status} end`,
    })
    .where(eq(batches.id, batchId));
}

/** Shrink a batch to the jobs actually created (credits ran out / provider down mid-batch). */
export async function setBatchTotal(batchId: string, total: number): Promise<BatchRow | undefined> {
  const [row] = await db
    .update(batches)
    .set({
      total,
      status: sql`case when ${batches.status} = 'running' and ${batches.completed} + ${batches.failed} >= ${total}::int
        then (case when ${batches.completed} > 0 then 'completed' else 'failed' end)
        else ${batches.status} end`,
    })
    .where(eq(batches.id, batchId))
    .returning();
  return row;
}

/** Safety net: close running batches that have no active jobs left (e.g. after a crash). */
export async function repairStaleBatches(): Promise<number> {
  const rows = await db
    .update(batches)
    .set({ status: sql`case when ${batches.completed} > 0 then 'completed' else 'failed' end` })
    .where(
      and(
        eq(batches.status, "running"),
        sql`${batches.updatedAt} < now() - interval '2 minutes'`,
        sql`not exists (select 1 from jobs j where j.batch_id = ${batches.id} and j.status in ('queued', 'running'))`,
      ),
    )
    .returning({ id: batches.id });
  return rows.length;
}
