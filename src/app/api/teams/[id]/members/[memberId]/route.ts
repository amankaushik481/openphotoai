import { parseBody, route } from "@/server/http";
import { removeMember, toTeamMemberDTO, updateMemberRole } from "@/server/teams";
import { updateMemberRequest } from "@/server/teams/schemas";

type Params = { id: string; memberId: string };

/** Remove a member / revoke an invite (owner/admin), or leave the team (own membership). */
export const DELETE = route<Params, "user">({ auth: "user" }, async ({ user, params }) => {
  const { left } = await removeMember(user.id, params.id, params.memberId);
  return { ok: true, left };
});

/** Change a member's role between admin and member (owner only). */
export const PATCH = route<Params, "user">({ auth: "user" }, async ({ req, user, params }) => {
  const { role } = await parseBody(req, updateMemberRequest);
  const member = await updateMemberRole(user.id, params.id, params.memberId, role);
  return { member: toTeamMemberDTO(member, null) };
});
