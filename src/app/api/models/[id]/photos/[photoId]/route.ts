import { route } from "@/server/http";
import { deleteTrainingPhoto, listTrainingPhotos } from "@/server/models/photos";
import { computeReadiness, computeReadinessByMode } from "@/server/models/readiness";
import { identityModeOf, toModelView } from "@/server/models/service";

/** Remove a training photo (stored files included). Allowed any time except while deleting the model. */
export const DELETE = route<{ id: string; photoId: string }, "user">({ auth: "user" }, async ({ user, params }) => {
  const model = await deleteTrainingPhoto(user.id, params.id, params.photoId);
  const rows = await listTrainingPhotos(model);
  const consentVerified = model.consentVerifiedAt !== null;
  return {
    ok: true,
    model: await toModelView(model, user.id),
    readiness: computeReadiness(rows, { mode: identityModeOf(model), consentVerified }),
    readinessByMode: computeReadinessByMode(rows, consentVerified),
  };
});
