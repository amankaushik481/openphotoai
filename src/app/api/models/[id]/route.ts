import { z } from "zod";
import { parseBody, parseQuery, route } from "@/server/http";
import { getViewableModel, renameModel, renameModelBody } from "@/server/models/crud";
import { listTrainingPhotos, toTrainingPhotoDTO } from "@/server/models/photos";
import { computeReadiness, computeReadinessByMode } from "@/server/models/readiness";
import { deleteModelCompletely, identityModeOf, toModelView } from "@/server/models/service";
import type { ModelDetailResponse } from "@/server/models/types";

type Params = { id: string };
const detailQuery = z.object({ mode: z.enum(["instant", "trained"]).optional() });

/**
 * Model + training photos + readiness. Models shared with the user are visible read-only, without
 * the owner's photos.
 */
export const GET = route<Params, "user_or_api">({ auth: "user_or_api" }, async ({ req, user, params }) => {
  const { mode } = parseQuery(req, detailQuery);
  const { model, shared } = await getViewableModel(user.id, params.id);
  const rows = await listTrainingPhotos(model);
  const consentVerified = model.consentVerifiedAt !== null;
  const response: ModelDetailResponse = {
    model: await toModelView(model, user.id),
    photos: shared ? [] : await Promise.all(rows.map(toTrainingPhotoDTO)),
    readiness: computeReadiness(rows, { mode: mode ?? identityModeOf(model), consentVerified }),
    readinessByMode: computeReadinessByMode(rows, consentVerified),
  };
  return response;
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
