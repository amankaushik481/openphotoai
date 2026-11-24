import { LIVENESS_FRAME_FIELD, LIVENESS_STEP_COUNT } from "@/lib/liveness";
import { clientIp, forwardedChain, route } from "@/server/http";
import { submitConsentSelfie } from "@/server/models/consent";
import { toModelView } from "@/server/models/service";
import { formImages, formText, readMultipartImage } from "@/server/models/upload";

/**
 * Live consent selfie with active liveness: multipart `selfie` (frontal camera capture), one
 * `liveness` frame per head-pose step of the challenge (in order) and the `captureToken` from
 * /consent/challenge.
 */
export const POST = route<{ id: string }, "user">({ auth: "user", rateLimit: "uploadsPerMinute" }, async ({ req, user, params }) => {
  const { bytes, form } = await readMultipartImage(req, "selfie", { maxFiles: 1 + LIVENESS_STEP_COUNT });
  const livenessFrames = await formImages(form, LIVENESS_FRAME_FIELD, LIVENESS_STEP_COUNT);
  const ip = clientIp(req);
  const model = await submitConsentSelfie({
    user,
    modelId: params.id,
    selfie: bytes,
    livenessFrames,
    captureToken: formText(form, "captureToken"),
    ipAddress: ip === "unknown" ? null : ip,
    userAgent: req.headers.get("user-agent"),
    forwarded: forwardedChain(req),
  });
  return { model: await toModelView(model, user.id) };
});
