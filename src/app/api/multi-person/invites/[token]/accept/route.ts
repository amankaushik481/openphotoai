import { clientIp, parseBody, route } from "@/server/http";
import { acceptInvite, acceptInviteRequest } from "@/server/together";

/**
 * Accept as the invitee (signed in with the invited email), sharing one of your own ready models.
 * `:token` is the emailed token, or the share id from an in-app "Respond" link.
 */
export const POST = route<{ token: string }, "user">({ auth: "user" }, async ({ req, user, params }) => {
  const { modelId } = await parseBody(req, acceptInviteRequest);
  await acceptInvite(user, params.token, modelId, {
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  return { ok: true };
});
