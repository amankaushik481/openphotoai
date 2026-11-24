import { parseBody, route } from "@/server/http";
import { transferCredits } from "@/server/teams";
import { transferCreditsRequest } from "@/server/teams/schemas";

/** Give credits from the team owner's balance to an active member (owner only). */
export const POST = route<{ id: string }, "user">({ auth: "user" }, async ({ req, user, params }) => {
  const { memberUserId, amount } = await parseBody(req, transferCreditsRequest);
  return { transfer: await transferCredits(user, params.id, memberUserId, amount) };
});
