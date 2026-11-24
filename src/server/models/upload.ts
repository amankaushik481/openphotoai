/** Multipart image intake shared by the consent-selfie and training-photo routes. */
import { UPLOAD_LIMITS } from "@/config/app";
import { AppError, errors, readFormDataLimited } from "@/server/http";
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

/**
 * Read `field` from a multipart request as an image (size + magic-byte checked). `maxFiles` raises the
 * request cap for forms that carry several images (e.g. the consent selfie + liveness frames).
 */
export async function readMultipartImage(req: Request, field: string, opts?: { maxFiles?: number }): Promise<MultipartImage> {
  let form: FormData;
  const files = Math.max(1, Math.floor(opts?.maxFiles ?? 1));
  try {
    // Capped while streaming, so a chunked body without Content-Length can't be buffered unbounded.
    form = await readFormDataLimited(req, files * UPLOAD_LIMITS.maxBytes + MULTIPART_OVERHEAD_BYTES);
  } catch (err) {
    if (err instanceof AppError) throw err.code === "payload_too_large" ? tooLarge() : err;
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

/** Every file sent under `field` (in order), each size + magic-byte checked. At most `max` files. */
export async function formImages(form: FormData, field: string, max: number): Promise<Uint8Array[]> {
  const entries = form.getAll(field);
  if (entries.length > max) throw errors.validation(`Send at most ${max} \`${field}\` images.`);
  const images: Uint8Array[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") throw errors.validation(`\`${field}\` must be an image file.`);
    if (entry.size === 0) throw errors.validation("The file is empty.");
    if (entry.size > UPLOAD_LIMITS.maxBytes) throw tooLarge();
    const bytes = new Uint8Array(await entry.arrayBuffer());
    if (!sniffImageType(bytes)) throw errors.validation("That file isn't a supported image (JPEG, PNG, WebP or HEIC).");
    images.push(bytes);
  }
  return images;
}

/** A text field of a multipart form ("" when absent). */
export function formText(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === "string" ? value.trim() : "";
}
