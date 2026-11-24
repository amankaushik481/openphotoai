import { createReport, createReportRequest } from "@/server/gallery/reports";
import { clientIp, parseBody, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/** Public report button. Always rate-limited by IP (also when the reporter is signed in). */
export const POST = route({ auth: "public" }, async ({ req, user }) => {
  await rateLimit("reportsPerHourPerIp", `ip:${clientIp(req)}`);
  const body = await parseBody(req, createReportRequest);
  await createReport(body, { reporterUserId: user?.id ?? null });
  return { ok: true };
});
