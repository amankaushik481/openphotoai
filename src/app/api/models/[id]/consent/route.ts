import { clientIp, route } from "@/server/http";
import { submitConsentSelfie } from "@/server/models/consent";
import { toModelView } from "@/server/models/service";
import { formText, readMultipartImage } from "@/server/models/upload";

/** Live consent selfie: multipart `selfie` (camera capture) + `captureToken` from /consent/challenge. */
export const POST = route<{ id: string }, "user">({ auth: "user", rateLimit: "uploadsPerMinute" }, async ({ req, user, params }) => {
  const { bytes, form } = await readMultipartImage(req, "selfie");
  const ip = clientIp(req);
  const model = await submitConsentSelfie({
    user,
    modelId: params.id,
    selfie: bytes,
    captureToken: formText(form, "captureToken"),
    ipAddress: ip === "unknown" ? null : ip,
    userAgent: req.headers.get("user-agent"),
  });
  return { model: await toModelView(model, user.id) };
});
