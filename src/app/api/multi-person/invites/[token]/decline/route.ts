import { route } from "@/server/http";
import { declineInvite } from "@/server/together";

/** Decline as the invitee. Nothing is shared. */
export const POST = route<{ token: string }, "user">({ auth: "user" }, async ({ user, params }) => {
  await declineInvite(user, params.token);
  return { ok: true };
});
