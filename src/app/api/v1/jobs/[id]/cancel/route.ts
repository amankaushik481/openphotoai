import { cancelJob, toJobDTO } from "@/server/jobs/engine";
import { v1Operations } from "@/server/openapi/operations";
import { v1Route } from "@/app/api/v1/_lib/handler";

/** Cancel a queued/running job; its credits are refunded. Finished jobs are returned unchanged. */
export const POST = v1Route<{ id: string }>(v1Operations.cancelJob, async ({ user, params }) => {
  const job = await cancelJob(user.id, params.id);
  return { job: await toJobDTO(job) };
});
