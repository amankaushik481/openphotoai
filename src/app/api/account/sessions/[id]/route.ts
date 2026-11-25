import { currentSessionId, revokeSession } from "@/server/account/sessions";
import { route } from "@/server/http";

/** DELETE /api/account/sessions/:id — sign out one other device → `{ ok }`. */
export const DELETE = route<{ id: string }, "user">({ auth: "user" }, async ({ req, user, params }) => {
  await revokeSession(user.id, params.id, await currentSessionId(req.headers));
  return { ok: true };
});
