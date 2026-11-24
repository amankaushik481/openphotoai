/** POST /api/admin/jobs/:id/refund { note? } — refund the job's unrefunded credits. */
import { refundJobAdmin } from "@/server/admin";
import { parseOptionalBody } from "@/server/admin/request";
import { refundBody } from "@/server/admin/schemas";
import { route } from "@/server/http";

export const POST = route<{ id: string }, "admin">({ auth: "admin" }, async ({ req, user, params }) => {
  const { note } = await parseOptionalBody(req, refundBody);
  return refundJobAdmin(user.id, params.id, note);
});
