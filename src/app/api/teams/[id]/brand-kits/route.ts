import { parseBody, route } from "@/server/http";
import { createBrandKit, listTeamBrandKits } from "@/server/teams";
import { createBrandKitRequest } from "@/server/teams/schemas";

type Params = { id: string };

/** The team's brand kits (any member). */
export const GET = route<Params, "user">({ auth: "user" }, async ({ user, params }) => {
  return { brandKits: await listTeamBrandKits(user.id, params.id) };
});

/** Create a brand kit (owner/admin; prompts pass the safety gate). */
export const POST = route<Params, "user">({ auth: "user" }, async ({ req, user, params }) => {
  const body = await parseBody(req, createBrandKitRequest);
  return { brandKit: await createBrandKit(user.id, params.id, body) };
});
