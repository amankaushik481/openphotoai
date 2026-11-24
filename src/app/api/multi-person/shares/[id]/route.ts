import { clientIp, route } from "@/server/http";
import { revokeShare } from "@/server/together";

/**
 * Revoke a share (either party): withdraws a pending invite or stops an accepted share.
 * Running jobs finish; new together photos with that model are refused.
 */
export const DELETE = route<{ id: string }, "user">({ auth: "user" }, async ({ req, user, params }) => {
  await revokeShare(user, params.id, { ipAddress: clientIp(req), userAgent: req.headers.get("user-agent") });
  return { ok: true };
});
