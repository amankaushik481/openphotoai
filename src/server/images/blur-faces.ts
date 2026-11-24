/**
 * Blur face regions of an uploaded reference / garment image (SAF-13): a pose or style reference may
 * show a real third party, whose face must never reach the generator (the identity always comes
 * from the user's own model). Boxes are expanded so hair line, jaw and ears are covered too.
 */
import sharp from "sharp";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Extra margin around each face box, as a fraction of the box size on every side. */
const BOX_MARGIN = 0.35;
const JPEG_QUALITY = 90;

/** Expanded, clamped integer region of `box` inside a `width`×`height` image (null when empty). */
export function expandBox(box: Box, width: number, height: number, margin = BOX_MARGIN): Box | null {
  const dx = box.width * margin;
  const dy = box.height * margin;
  const left = Math.max(0, Math.floor(box.x - dx));
  const top = Math.max(0, Math.floor(box.y - dy));
  const right = Math.min(width, Math.ceil(box.x + box.width + dx));
  const bottom = Math.min(height, Math.ceil(box.y + box.height + dy));
  return right - left >= 2 && bottom - top >= 2 ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/** JPEG of `bytes` with every box heavily blurred (unrecognizable). Returns the input when there are no boxes. */
export async function blurRegions(bytes: Uint8Array, boxes: readonly Box[]): Promise<Uint8Array> {
  if (boxes.length === 0) return bytes;
  const image = sharp(bytes, { autoOrient: true });
  const meta = await image.metadata();
  const width = meta.autoOrient?.width ?? meta.width;
  const height = meta.autoOrient?.height ?? meta.height;
  if (!width || !height) throw new Error("blurRegions: unreadable image");

  const regions = boxes.map((b) => expandBox(b, width, height)).filter((r): r is Box => r !== null);
  if (regions.length === 0) return bytes;
  const overlays = await Promise.all(
    regions.map(async (r) => ({
      input: await sharp(bytes, { autoOrient: true })
        .extract({ left: r.x, top: r.y, width: r.width, height: r.height })
        // Pixelate (down + up with nearest) then blur: no facial detail survives at any size.
        .resize(Math.max(1, Math.round(r.width / 16)), Math.max(1, Math.round(r.height / 16)), { fit: "fill" })
        .resize(r.width, r.height, { fit: "fill", kernel: "nearest" })
        .blur(Math.max(2, Math.min(r.width, r.height) / 20))
        .toBuffer(),
      left: r.x,
      top: r.y,
    })),
  );
  const out = await sharp(bytes, { autoOrient: true }).composite(overlays).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  return new Uint8Array(out);
}

/** Binary (pure black / white) PNG of a brush mask: transparency = keep (black), anything lighter than mid-grey = repaint. */
export async function binarizeMask(bytes: Uint8Array): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const { data, info } = await sharp(bytes, { failOn: "error", limitInputPixels: 100_000_000 })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .greyscale()
    .threshold(128)
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: new Uint8Array(data), width: info.width, height: info.height };
}
