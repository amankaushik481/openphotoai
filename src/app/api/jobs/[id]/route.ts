import { route } from "@/server/http";
import { getJobForUser, toJobDTO } from "@/server/jobs/engine";

/** Job status; lazily syncs with the AI provider when the last poll is stale. */
export const GET = route<{ id: string }>({ auth: "user" }, async ({ user, params }) => {
  const job = await getJobForUser(user.id, params.id, { sync: true });
  return { job: await toJobDTO(job) };
});
