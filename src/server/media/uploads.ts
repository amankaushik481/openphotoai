/**
 * Multipart uploads of job inputs (pose/style reference, try-on garment, brush mask), shared by
 * `POST /api/uploads` (session) and `POST /api/v1/uploads` (API key).
 */
import { z } from "zod";
import { UPLOAD_LIMITS } from "@/config/app";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { newId } from "@/lib/ids";
import { AppError, errors, readFormDataLimited } from "@/server/http";
import { binarizeMask, blurRegions } from "@/server/images/blur-faces";
import { normalizeImage } from "@/server/images/process";
import { sniffImageType } from "@/server/media/sniff";
import { assertReferenceImageAllowed } from "@/server/safety";
import { getStorage, signedUrl, storageKeys } from "@/server/storage";
import type { FaceAnalysisSummary, ModerationSnapshot } from "@/types/domain";

export const UPLOAD_PURPOSES = ["reference", "garment", "mask"] as const;
const purposeSchema = z.enum(UPLOAD_PURPOSES);
/** Multipart framing + the `purpose` field on top of the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
export const UPLOAD_MAX_MB = Math.round(UPLOAD_LIMITS.maxBytes / (1024 * 1024));

const tooLarge = () => new AppError("payload_too_large", `Images must be ${UPLOAD_MAX_MB} MB or smaller.`);

export interface UploadDTO {
  id: string;
  /** Short-lived signed URL of the stored image. */
  url: string;
  width: number;
  height: number;
}

/**
 * Read a multipart request (`file`, `purpose`) and store the upload. References and garments are
 * normalized (EXIF/GPS stripped, re-encoded JPEG), safety-checked and stored with every face blurred;
 * masks are classified too and stored as a pure black/white PNG.
 */
export async function createUploadFromRequest(req: Request, user: Pick<UserRow, "id">): Promise<{ upload: UploadDTO }> {
  let form: FormData;
  try {
    // Capped while streaming, so a chunked body without Content-Length can't be buffered unbounded.
    form = await readFormDataLimited(req, UPLOAD_LIMITS.maxBytes + MULTIPART_OVERHEAD_BYTES);
  } catch (err) {
    if (err instanceof AppError) throw err.code === "payload_too_large" ? tooLarge() : err;
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
    // The classifier runs on what was sent; only a pure black/white re-encode is stored (no content, no metadata).
    ({ moderation } = await assertReferenceImageAllowed(raw, { userId: user.id, purpose: "mask" }));
    ({ bytes, width, height } = await binarizeMask(raw).catch(() => {
      throw errors.validation("That mask image couldn't be read.");
    }));
    mimeType = "image/png";
  } else {
    const normalized = await normalizeImage(raw).catch(() => {
      throw errors.validation("That image couldn't be read. Try a JPEG or PNG.");
    });
    ({ width, height, mimeType } = normalized);
    const checked = await assertReferenceImageAllowed(normalized.bytes, { userId: user.id, purpose: purpose.data });
    ({ face, moderation } = checked);
    // A reference may show a real third party: their face never reaches a generator (SAF-13).
    bytes = await blurRegions(normalized.bytes, checked.faceBoxes);
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
}
