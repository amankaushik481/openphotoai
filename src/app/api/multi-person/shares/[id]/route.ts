import { clientIp, forwardedChain, route } from "@/server/http";
import { revokeShare } from "@/server/together";

/**
 * Revoke a share (either party): withdraws a pending invite or stops an accepted share.
 * Running jobs finish; new together photos with that model are refused.
 */
export const DELETE = route<{ id: string }, "user">({ auth: "user" }, async ({ req, user, params }) => {
  const ip = clientIp(req);
  await revokeShare(user, params.id, {
    ipAddress: ip === "unknown" ? null : ip,
    userAgent: req.headers.get("user-agent"),
    forwarded: forwardedChain(req),
  });
  return { ok: true };
});
