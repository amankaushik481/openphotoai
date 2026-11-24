/** GET /api/cron/maintenance — `Authorization: Bearer CRON_SECRET`. See src/server/maintenance. */
import { errors, route } from "@/server/http";
import { isCronAuthorized, runMaintenance } from "@/server/maintenance";

export const maxDuration = 60;

export const GET = route({ auth: "public" }, async ({ req }) => {
  if (!isCronAuthorized(req)) throw errors.unauthorized("Invalid or missing cron secret.");
  const result = await runMaintenance();
  return { ok: true, ...result };
});
