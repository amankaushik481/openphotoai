/** POST /api/admin/reports/:id/resolve { action: dismiss|remove_media|suspend_user, note } */
import { resolveReport } from "@/server/admin";
import { resolveReportBody } from "@/server/admin/schemas";
import { parseBody, route } from "@/server/http";

export const POST = route<{ id: string }, "admin">({ auth: "admin" }, async ({ req, user, params }) => {
  const { action, note } = await parseBody(req, resolveReportBody);
  return resolveReport(user.id, params.id, action, note);
});
