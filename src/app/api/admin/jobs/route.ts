/** GET /api/admin/jobs?status&type&userId&cursor&limit — all jobs, newest first, with cost + credits. */
import { listJobs } from "@/server/admin";
import { jobsQuery } from "@/server/admin/schemas";
import { parseQuery, route } from "@/server/http";

export const GET = route({ auth: "admin" }, async ({ req }) => {
  return listJobs(parseQuery(req, jobsQuery));
});
