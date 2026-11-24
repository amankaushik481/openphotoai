import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { syncRunningJobs } from "@/server/jobs/api";
import { getBatchForUser, toBatchDTO } from "@/server/jobs/batches";
import { toJobDTOs } from "@/server/jobs/queries";
import { v1Operations } from "@/server/openapi/operations";
import { v1Route } from "@/app/api/v1/_lib/handler";

/** Batch progress + its jobs (running jobs are lazily synced with the provider). */
export const GET = v1Route<{ id: string }>(v1Operations.getBatch, async ({ user, params }) => {
  await getBatchForUser(user.id, params.id);
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.batchId, params.id), eq(jobs.userId, user.id)))
    .orderBy(asc(jobs.createdAt));
  const synced = await syncRunningJobs(rows);
  // Re-read the batch: syncing may have finished jobs and bumped its counters.
  const batch = await getBatchForUser(user.id, params.id);
  return { batch: toBatchDTO(batch), jobs: await toJobDTOs(synced) };
});
