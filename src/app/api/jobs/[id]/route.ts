import { route } from "@/server/http";
import { completeAfterResponse } from "@/server/jobs/api";
import { getJobForUser, toJobDTO } from "@/server/jobs/engine";

/** Job status; lazily syncs with the AI provider when the last poll is stale. */
export const GET = route<{ id: string }, "user">({ auth: "user" }, async ({ user, params }) => {
  // Completion (output ingestion) runs after the response; the next poll sees the finished job.
  const job = await getJobForUser(user.id, params.id, { sync: true, deferCompletion: completeAfterResponse() });
  return { job: await toJobDTO(job) };
});
