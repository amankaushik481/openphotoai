import { parseBody, route } from "@/server/http";
import { createTeam, listMyTeams, toTeamSummaryDTO } from "@/server/teams";
import { createTeamRequest } from "@/server/teams/schemas";

/** Teams I actively belong to. */
export const GET = route({ auth: "user" }, async ({ user }) => {
  return { teams: await listMyTeams(user.id) };
});

/** Create my team (Studio plan; one owned team per user). */
export const POST = route({ auth: "user" }, async ({ req, user }) => {
  const { name } = await parseBody(req, createTeamRequest);
  const team = await createTeam(user, name);
  return { team: toTeamSummaryDTO(team, { role: "owner", ownerName: user.name || user.email, memberCount: 1 }) };
});
