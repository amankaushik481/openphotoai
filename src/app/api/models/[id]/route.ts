import { z } from "zod";
import { parseBody, parseQuery, route } from "@/server/http";
import { renameModel, renameModelBody } from "@/server/models/crud";
import { getModelDetail } from "@/server/models/detail";
import { deleteModelCompletely, toModelView } from "@/server/models/service";

type Params = { id: string };
const detailQuery = z.object({ mode: z.enum(["instant", "trained"]).optional() });

/**
 * Model + training photos + readiness (for the model's mode, or `?mode=`), plus `readinessByMode`.
 * Models shared with the user are visible read-only, without the owner's photos.
 */
export const GET = route<Params, "user_or_api">({ auth: "user_or_api" }, async ({ req, user, params }) => {
  const { mode } = parseQuery(req, detailQuery);
  return getModelDetail(user.id, params.id, mode);
});

export const PATCH = route<Params, "user">({ auth: "user" }, async ({ req, user, params }) => {
  const { name } = await parseBody(req, renameModelBody);
  return { model: await toModelView(await renameModel(user.id, params.id, name), user.id) };
});

/** Real deletion: provider weights, stored photos + consent selfie, rows; confirmation email. */
export const DELETE = route<Params, "user">({ auth: "user" }, async ({ user, params }) => {
  await deleteModelCompletely(user.id, params.id);
  return { ok: true };
});
