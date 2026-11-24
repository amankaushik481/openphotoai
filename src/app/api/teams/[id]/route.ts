import { parseBody, route } from "@/server/http";
import { deleteTeam, getTeamDetail, renameTeam } from "@/server/teams";
import { updateTeamRequest } from "@/server/teams/schemas";

type Params = { id: string };

/** Team detail: members, brand kits, seats (members only). */
export const GET = route<Params, "user">({ auth: "user" }, async ({ user, params }) => {
  return getTeamDetail(user.id, params.id);
});

/** Rename (owner only). */
export const PATCH = route<Params, "user">({ auth: "user" }, async ({ req, user, params }) => {
  const { name } = await parseBody(req, updateTeamRequest);
  await renameTeam(user.id, params.id, name);
  return getTeamDetail(user.id, params.id);
});

/** Delete the team, its memberships and brand kits (owner only). */
export const DELETE = route<Params, "user">({ auth: "user" }, async ({ user, params }) => {
  await deleteTeam(user.id, params.id);
  return { ok: true };
});
