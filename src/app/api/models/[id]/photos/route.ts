import { route } from "@/server/http";
import { addTrainingPhoto, listTrainingPhotos, toTrainingPhotoDTO } from "@/server/models/photos";
import { computeReadiness, computeReadinessByMode } from "@/server/models/readiness";
import { identityModeOf } from "@/server/models/service";
import type { AddPhotoResponse } from "@/server/models/types";
import { readMultipartImage } from "@/server/models/upload";

/**
 * Add a training photo (multipart `file`). EXIF/GPS are stripped; the photo is quality + safety
 * checked. Photos failing a safety check are not stored (422/400 with `details.quality`).
 */
export const POST = route<{ id: string }, "user">({ auth: "user", rateLimit: "uploadsPerMinute" }, async ({ req, user, params }) => {
  const { bytes } = await readMultipartImage(req, "file");
  const { photo, model } = await addTrainingPhoto(user, params.id, bytes);
  const rows = await listTrainingPhotos(model);
  const consentVerified = model.consentVerifiedAt !== null;
  const response: AddPhotoResponse = {
    photo: await toTrainingPhotoDTO(photo),
    readiness: computeReadiness(rows, { mode: identityModeOf(model), consentVerified }),
    readinessByMode: computeReadinessByMode(rows, consentVerified),
  };
  return response;
});
