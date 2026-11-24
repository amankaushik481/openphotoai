import { route } from "@/server/http";
import { cancelJob, toJobDTO } from "@/server/jobs/engine";

/** Cancel a queued/running job; its credits are refunded. Finished jobs are returned unchanged. */
export const POST = route<{ id: string }, "user">({ auth: "user" }, async ({ user, params }) => {
  const job = await cancelJob(user.id, params.id);
  return { job: await toJobDTO(job) };
});
