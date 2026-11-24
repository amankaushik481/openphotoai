import { parseBody, parseQuery } from "@/server/http";
import { readIdempotencyKey, syncRunningJobs } from "@/server/jobs/api";
import { createJob, toJobDTO } from "@/server/jobs/engine";
import { listJobsForUser, listJobsQuery, toJobDTOs } from "@/server/jobs/queries";
import { v1Operations } from "@/server/openapi/operations";
import { createJobRequest } from "@/types/domain";
import { v1Route } from "@/app/api/v1/_lib/handler";

/** Create a job; the API key is recorded on it. `Idempotency-Key` replays return the original job. */
export const POST = v1Route(v1Operations.createJob, async ({ req, user, apiKey }) => {
  const idempotencyKey = readIdempotencyKey(req);
  const body = await parseBody(req, createJobRequest);
  const job = await createJob(user, body, { idempotencyKey, apiKeyId: apiKey.id });
  return { job: await toJobDTO(job) };
});

/** `?status&type&limit&cursor` (newest first), or `?ids=a,b,c` to poll specific jobs. */
export const GET = v1Route(v1Operations.listJobs, async ({ req, user }) => {
  const query = parseQuery(req, listJobsQuery);
  const page = await listJobsForUser(user.id, query);
  const rows = query.ids ? await syncRunningJobs(page.jobs) : page.jobs;
  return { jobs: await toJobDTOs(rows), nextCursor: page.nextCursor };
});
