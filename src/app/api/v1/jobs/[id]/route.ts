import { getJobForUser, toJobDTO } from "@/server/jobs/engine";
import { v1Operations } from "@/server/openapi/operations";
import { v1Route } from "@/app/api/v1/_lib/handler";

/** Job status; lazily syncs with the AI provider when the last poll is stale. */
export const GET = v1Route<{ id: string }>(v1Operations.getJob, async ({ user, params }) => {
  const job = await getJobForUser(user.id, params.id, { sync: true });
  return { job: await toJobDTO(job) };
});
