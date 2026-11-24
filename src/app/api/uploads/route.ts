import { z } from "zod";
import { UPLOAD_LIMITS } from "@/config/app";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { newId } from "@/lib/ids";
import { AppError, errors, route } from "@/server/http";
import { imageMetrics, normalizeImage } from "@/server/images/process";
import { sniffImageType } from "@/server/media/sniff";
import { assertReferenceImageAllowed } from "@/server/safety";
import { getStorage, signedUrl, storageKeys } from "@/server/storage";
import type { FaceAnalysisSummary, ModerationSnapshot } from "@/types/domain";

const purposeSchema = z.enum(["reference", "garment", "mask"]);
/** Multipart framing + the `purpose` field on top of the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_MB = Math.round(UPLOAD_LIMITS.maxBytes / (1024 * 1024));

const tooLarge = () => new AppError("payload_too_large", `Images must be ${MAX_MB} MB or smaller.`);

/**
 * Upload a pose/style reference, a garment (try-on) or a brush mask. References and garments are
 * normalized (EXIF/GPS stripped, re-encoded JPEG) and safety-checked; masks are kept as PNG.
 */
export const POST = route({ auth: "user", rateLimit: "uploadsPerMinute" }, async ({ req, user }) => {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > UPLOAD_LIMITS.maxBytes + MULTIPART_OVERHEAD_BYTES) throw tooLarge();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw errors.validation("Send the image as multipart/form-data with a `file` field.");
  }
  const purpose = purposeSchema.safeParse(form.get("purpose"));
  if (!purpose.success) throw errors.validation("`purpose` must be reference, garment or mask.");
  const file = form.get("file");
  if (!file || typeof file === "string") throw errors.validation("Missing `file`.");
  if (file.size === 0) throw errors.validation("The file is empty.");
  if (file.size > UPLOAD_LIMITS.maxBytes) throw tooLarge();

  const raw = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(raw);
  if (!type) throw errors.validation("That file isn't a supported image (JPEG, PNG, WebP or HEIC).");

  let bytes: Uint8Array;
  let mimeType: string;
  let width: number;
  let height: number;
  let face: FaceAnalysisSummary | null = null;
  let moderation: ModerationSnapshot | null = null;
  if (purpose.data === "mask") {
    if (type !== "image/png") throw errors.validation("Masks must be PNG images.");
    const metrics = await imageMetrics(raw).catch(() => {
      throw errors.validation("That mask image couldn't be read.");
    });
    ({ width, height } = metrics);
    bytes = raw;
    mimeType = "image/png";
  } else {
    const normalized = await normalizeImage(raw).catch(() => {
      throw errors.validation("That image couldn't be read. Try a JPEG or PNG.");
    });
    ({ bytes, width, height, mimeType } = normalized);
    ({ face, moderation } = await assertReferenceImageAllowed(bytes, { userId: user.id, purpose: purpose.data }));
  }

  const id = newId("upl");
  const key = storageKeys.upload(user.id, id, mimeType === "image/png" ? "png" : "jpg");
  await getStorage().put(key, bytes, { contentType: mimeType });
  await db.insert(uploads).values({
    id,
    userId: user.id,
    purpose: purpose.data,
    storageKey: key,
    mimeType,
    bytes: bytes.byteLength,
    width,
    height,
    face,
    moderation,
  });
  return { upload: { id, url: await signedUrl(key), width, height } };
});
