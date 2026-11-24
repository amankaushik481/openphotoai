/** GET /api/models/:id payload, shared by the route and the server-rendered model pages. */
import type { IdentityModelRow } from "@/db/types";
import { getViewableModel, listModelsForUser } from "./crud";
import { listTrainingPhotos, toTrainingPhotoDTO } from "./photos";
import { computeReadiness, computeReadinessByMode } from "./readiness";
import { identityModeOf, toModelView, type IdentityMode } from "./service";
import type { ModelDetailResponse, ModelView } from "./types";

/** Model + photos + readiness for a model `model` the viewer may see (photos hidden when shared). */
export async function buildModelDetail(
  model: IdentityModelRow,
  viewerUserId: string,
  opts: { shared: boolean; mode?: IdentityMode },
): Promise<ModelDetailResponse> {
  const rows = await listTrainingPhotos(model);
  const consentVerified = model.consentVerifiedAt !== null;
  return {
    model: await toModelView(model, viewerUserId),
    photos: opts.shared ? [] : await Promise.all(rows.map(toTrainingPhotoDTO)),
    readiness: computeReadiness(rows, { mode: opts.mode ?? identityModeOf(model), consentVerified }),
    readinessByMode: computeReadinessByMode(rows, consentVerified),
  };
}

/** Throws not_found unless the user owns the model or it is shared with them. */
export async function getModelDetail(userId: string, modelId: string, mode?: IdentityMode): Promise<ModelDetailResponse> {
  const { model, shared } = await getViewableModel(userId, modelId);
  return buildModelDetail(model, userId, { shared, mode });
}

export async function listModelViews(userId: string): Promise<ModelView[]> {
  const rows = await listModelsForUser(userId);
  return Promise.all(rows.map((row) => toModelView(row, userId)));
}
