import { currentSessionId, listSessions, revokeOtherSessions } from "@/server/account/sessions";
import { route } from "@/server/http";

/** GET /api/account/sessions — the signed-in user's active sessions (current one first). */
export const GET = route({ auth: "user" }, async ({ req, user }) => {
  return { sessions: await listSessions(user.id, await currentSessionId(req.headers)) };
});

/** DELETE /api/account/sessions — sign out every other device → `{ revoked }`. */
export const DELETE = route({ auth: "user" }, async ({ req, user }) => {
  return { revoked: await revokeOtherSessions(user.id, await currentSessionId(req.headers)) };
});
