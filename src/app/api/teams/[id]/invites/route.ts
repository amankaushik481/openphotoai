import { parseBody, route } from "@/server/http";
import { inviteMember, toTeamMemberDTO } from "@/server/teams";
import { inviteMemberRequest } from "@/server/teams/schemas";

/** Invite by email (owner/admin). Re-inviting a pending address re-sends with a fresh link. */
export const POST = route<{ id: string }, "user">({ auth: "user" }, async ({ req, user, params }) => {
  const { email } = await parseBody(req, inviteMemberRequest);
  const { member, resent } = await inviteMember(user, params.id, email);
  return { member: toTeamMemberDTO(member, null), resent };
});
