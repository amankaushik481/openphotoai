/** Multipart image intake shared by the consent-selfie and training-photo routes. */
import { UPLOAD_LIMITS } from "@/config/app";
import { AppError, errors } from "@/server/http";
import { sniffImageType } from "@/server/media/sniff";

/** Multipart framing + small text fields on top of the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_MB = Math.round(UPLOAD_LIMITS.maxBytes / (1024 * 1024));

const tooLarge = () => new AppError("payload_too_large", `Photos must be ${MAX_MB} MB or smaller.`);

export interface MultipartImage {
  /** Raw (not yet normalized) image bytes; the type is verified by magic bytes. */
  bytes: Uint8Array;
  form: FormData;
}

/** Read `field` from a multipart request as an image (size + magic-byte checked). */
export async function readMultipartImage(req: Request, field: string): Promise<MultipartImage> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > UPLOAD_LIMITS.maxBytes + MULTIPART_OVERHEAD_BYTES) throw tooLarge();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw errors.validation(`Send the photo as multipart/form-data with a \`${field}\` field.`);
  }
  const file = form.get(field);
  if (!file || typeof file === "string") throw errors.validation(`Missing \`${field}\`.`);
  if (file.size === 0) throw errors.validation("The file is empty.");
  if (file.size > UPLOAD_LIMITS.maxBytes) throw tooLarge();

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffImageType(bytes)) throw errors.validation("That file isn't a supported image (JPEG, PNG, WebP or HEIC).");
  return { bytes, form };
}

/** A text field of a multipart form ("" when absent). */
export function formText(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === "string" ? value.trim() : "";
}
