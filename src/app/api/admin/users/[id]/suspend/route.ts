/** POST /api/admin/users/:id/suspend { reason } — ban, end sessions, revoke share links, email the user. */
import { suspendUser } from "@/server/admin";
import { suspendBody } from "@/server/admin/schemas";
import { parseBody, route } from "@/server/http";

export const POST = route<{ id: string }, "admin">({ auth: "admin" }, async ({ req, user, params }) => {
  const { reason } = await parseBody(req, suspendBody);
  const result = await suspendUser(user.id, params.id, reason);
  return {
    suspended: result.suspended,
    sessionsDeleted: result.sessionsDeleted,
    shareLinksRevoked: result.shareLinksRevoked,
  };
});
