import { createReport, createReportRequest } from "@/server/gallery/reports";
import { knownClientIp, parseBody, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/**
 * Public report button. Always rate-limited by IP (also when the reporter is signed in). Without a
 * known client IP that bucket is shared by every visitor, so signed-in reporters are then limited per
 * account instead (an anonymous flood can't silence them); anonymous reports stay fail-closed.
 */
export const POST = route({ auth: "public" }, async ({ req, user }) => {
  const ip = knownClientIp(req);
  await rateLimit("reportsPerHourPerIp", ip || !user ? `ip:${ip ?? "unknown"}` : `user:${user.id}`);
  const body = await parseBody(req, createReportRequest);
  await createReport(body, { reporterUserId: user?.id ?? null, reporterAccountEmail: user?.email ?? null });
  return { ok: true };
});
