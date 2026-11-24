import { parseBody, parseQuery, route } from "@/server/http";
import { readIdempotencyKey, syncRunningJobs } from "@/server/jobs/api";
import { createJob, toJobDTO } from "@/server/jobs/engine";
import { listJobsForUser, listJobsQuery, toJobDTOs } from "@/server/jobs/queries";
import { createJobRequest } from "@/types/domain";

/** Create a job (credits are charged up front, refunded automatically on failure). */
export const POST = route({ auth: "user" }, async ({ req, user, apiKey }) => {
  const idempotencyKey = readIdempotencyKey(req);
  const body = await parseBody(req, createJobRequest);
  const job = await createJob(user, body, { idempotencyKey, apiKeyId: apiKey?.id ?? null });
  return { job: await toJobDTO(job) };
});

/** `?status&type&limit&cursor` (newest first), or `?ids=a,b,c` to poll specific jobs. */
export const GET = route({ auth: "user" }, async ({ req, user }) => {
  const query = parseQuery(req, listJobsQuery);
  const page = await listJobsForUser(user.id, query);
  const rows = query.ids ? await syncRunningJobs(page.jobs) : page.jobs;
  return { jobs: await toJobDTOs(rows), nextCursor: page.nextCursor };
});
