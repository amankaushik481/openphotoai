import { route } from "@/server/http";
import { acceptInvite } from "@/server/teams";

/** Join a team with an emailed invite token (signed-in email must match the invite). */
export const POST = route<{ token: string }, "user">({ auth: "user" }, async ({ user, params }) => {
  const { team } = await acceptInvite(user, params.token);
  return { team: { id: team.id, name: team.name } };
});
