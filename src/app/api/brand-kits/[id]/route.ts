import { parseBody, route } from "@/server/http";
import { deleteBrandKit, updateBrandKit } from "@/server/teams";
import { updateBrandKitRequest } from "@/server/teams/schemas";

type Params = { id: string };

/** Update a brand kit (owner/admin of its team). */
export const PATCH = route<Params, "user">({ auth: "user" }, async ({ req, user, params }) => {
  const patch = await parseBody(req, updateBrandKitRequest);
  return { brandKit: await updateBrandKit(user.id, params.id, patch) };
});

/** Delete a brand kit (owner/admin of its team). */
export const DELETE = route<Params, "user">({ auth: "user" }, async ({ user, params }) => {
  await deleteBrandKit(user.id, params.id);
  return { ok: true };
});
