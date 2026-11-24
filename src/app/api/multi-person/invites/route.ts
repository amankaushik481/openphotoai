import { parseBody, route } from "@/server/http";
import { createInvite, createInviteRequest, listInvites } from "@/server/together";

/** Invite someone (by email) to share one of their models with you. Emails them a link. */
export const POST = route({ auth: "user" }, async ({ req, user }) => {
  const body = await parseBody(req, createInviteRequest);
  return createInvite(user, { email: body.email, message: body.message ?? null });
});

/** `{ sent, received }`: invites you sent, and invites addressed to you / shares of your models. */
export const GET = route({ auth: "user" }, async ({ user }) => listInvites(user));
