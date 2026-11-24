import { route } from "@/server/http";
import { assertCronRequest } from "@/server/jobs/api";
import { pollStaleJobs } from "@/server/jobs/engine";

export const maxDuration = 60;

/** Vercel Cron: sync stale running jobs and time out stuck ones. `Authorization: Bearer CRON_SECRET`. */
export const GET = route({ auth: "public" }, async ({ req }) => {
  assertCronRequest(req);
  return pollStaleJobs({ limit: 50 });
});
