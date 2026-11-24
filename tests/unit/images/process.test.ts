import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { APP } from "@/config/app";
import {
  applyAiLabel,
  applyWatermark,
  cropRegion,
  hammingDistance,
  imageMetrics,
  makeThumbnail,
  normalizeImage,
  perceptualHash,
  readAiLabel,
  TRAINED_ALGORITHMIC_MEDIA,
} from "@/server/images/process";
import { AppError } from "@/server/http";

/* ───────────── generated fixtures ───────────── */

/** A "scene" with gradients and shapes; `variant` changes the composition. */
function sceneSvg(width: number, height: number, variant: "a" | "b"): Buffer {
  const shapes =
    variant === "a"
      ? `<linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#102040"/><stop offset="1" stop-color="#f0e0c0"/></linearGradient>
         <rect width="100%" height="100%" fill="url(#g)"/>
         <circle cx="${width * 0.3}" cy="${height * 0.4}" r="${height * 0.25}" fill="#c03030"/>
         <rect x="${width * 0.6}" y="${height * 0.5}" width="${width * 0.25}" height="${height * 0.35}" fill="#204020"/>`
      : `<linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f8f8f0"/><stop offset="1" stop-color="#202020"/></linearGradient>
         <rect width="100%" height="100%" fill="url(#g)"/>
         <circle cx="${width * 0.75}" cy="${height * 0.7}" r="${height * 0.2}" fill="#3050d0"/>
         <rect x="${width * 0.05}" y="${height * 0.05}" width="${width * 0.3}" height="${height * 0.2}" fill="#e0c020"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs/>${shapes}</svg>`);
}

const scene = (w: number, h: number, v: "a" | "b" = "a") => sharp(sceneSvg(w, h, v)).jpeg({ quality: 90 }).toBuffer();

/** High-frequency detail: fine checkerboard. */
async function detailed(w = 400, h = 300): Promise<Buffer> {
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = ((x >> 2) + (y >> 2)) % 2 ? 200 : 60;
      raw.fill(v, (y * w + x) * 3, (y * w + x) * 3 + 3);
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

const solid = (w: number, h: number, hex: string) =>
  sharp({ create: { width: w, height: h, channels: 3, background: hex } }).png().toBuffer();

async function rawPixels(bytes: Uint8Array) {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, ...info };
}

/** Mean absolute RGB difference inside a rectangle of two same-size images. */
function regionDiff(
  a: { data: Buffer; width: number; channels: number },
  b: { data: Buffer },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      for (let c = 0; c < 3; c++) {
        const i = (y * a.width + x) * a.channels + c;
        sum += Math.abs(a.data[i]! - b.data[i]!);
        n++;
      }
    }
  }
  return sum / n;
}

async function expectValidationError(p: Promise<unknown>, message: RegExp) {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe("validation_error");
  expect((err as AppError).message).toMatch(message);
}

/* ───────────── normalizeImage ───────────── */

describe("normalizeImage", () => {
  it("applies EXIF orientation and strips all metadata (incl. GPS)", async () => {
    // 200x100 blue image with a red block in the stored top-left corner.
    const stored = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#0000ff" } })
      .composite([{ input: { create: { width: 40, height: 40, channels: 3, background: "#ff0000" } }, left: 0, top: 0 }])
      .jpeg()
      .toBuffer();
    const tagged = await sharp(stored)
      .withMetadata({ orientation: 6 }) // rotate 90° clockwise for display
      .withExifMerge({
        IFD0: { Make: "TestCam" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "0/1 7/1 0/1" },
      })
      .withXmp(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>`)
      .jpeg()
      .toBuffer();
    const inMeta = await sharp(tagged).metadata();
    expect(inMeta.orientation).toBe(6);
    expect(inMeta.exif?.includes(Buffer.from([0x25, 0x88]))).toBe(true); // GPS IFD pointer tag
    expect(inMeta.xmp).toBeDefined();

    const out = await normalizeImage(tagged);
    expect(out.mimeType).toBe("image/jpeg");
    expect([out.width, out.height]).toEqual([100, 200]);

    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(200);
    expect(meta.orientation).toBeUndefined();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(meta.space).toBe("srgb");
    expect(Buffer.from(out.bytes).includes(Buffer.from("TestCam"))).toBe(false);

    // The red block is now in the top-right corner (rotated 90° clockwise).
    const px = await rawPixels(out.bytes);
    const at = (x: number, y: number) => Array.from(px.data.subarray((y * px.width + x) * 3, (y * px.width + x) * 3 + 3));
    const [r, g, b] = at(px.width - 10, 10);
    expect(r).toBeGreaterThan(200);
    expect(g! + b!).toBeLessThan(80);
    expect(at(10, 10)[2]).toBeGreaterThan(200); // top-left is blue
  });

  it("caps the longest side without enlarging small images", async () => {
    const big = await normalizeImage(await solid(3000, 1000, "#808080"));
    expect([big.width, big.height]).toEqual([2048, 683]);
    const capped = await normalizeImage(await solid(3000, 1000, "#808080"), { maxSide: 600 });
    expect([capped.width, capped.height]).toEqual([600, 200]);
    const small = await normalizeImage(await solid(300, 200, "#808080"));
    expect([small.width, small.height]).toEqual([300, 200]);
  });

  it("flattens transparent PNGs to a JPEG", async () => {
    const png = await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const out = await normalizeImage(png);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.hasAlpha).toBe(false);
    const px = await rawPixels(out.bytes);
    expect(px.data[0]).toBeGreaterThan(240); // white background
  });

  it("rejects undecodable input with a friendly validation error", async () => {
    await expectValidationError(normalizeImage(new TextEncoder().encode("definitely not an image")), /couldn't read this image/);
    const truncated = (await scene(200, 100)).subarray(0, 300);
    await expectValidationError(normalizeImage(truncated), /couldn't read this image/);
  });

  it("suggests JPEG for HEIC files it cannot decode", async () => {
    const heicHeader = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from("ftypheic"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("mif1heic"),
      Buffer.alloc(64),
    ]);
    await expectValidationError(normalizeImage(heicHeader), /HEIC.*JPEG/);
  });
});

/* ───────────── thumbnails + metrics ───────────── */

describe("makeThumbnail", () => {
  it("produces a WebP with the longest side capped at 512", async () => {
    const thumb = await makeThumbnail(await scene(1600, 900));
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([512, 288]);

    const custom = await sharp(await makeThumbnail(await scene(1600, 900), 128)).metadata();
    expect(custom.width).toBe(128);
    const small = await sharp(await makeThumbnail(await scene(200, 100))).metadata();
    expect(small.width).toBe(200);
  });
});

describe("imageMetrics", () => {
  it("scores a sharp image well above a blurred copy", async () => {
    const crisp = await detailed();
    const blurred = await sharp(crisp).blur(4).png().toBuffer();
    const a = await imageMetrics(crisp);
    const b = await imageMetrics(blurred);
    expect(a.width).toBe(400);
    expect(a.height).toBe(300);
    expect(a.sharpness).toBeGreaterThan(b.sharpness * 10);
  });

  it("measures brightness and contrast", async () => {
    const dark = await imageMetrics(await solid(200, 200, "#1e1e1e"));
    const bright = await imageMetrics(await solid(200, 200, "#dcdcdc"));
    expect(dark.brightness).toBeCloseTo(30, 0);
    expect(bright.brightness).toBeCloseTo(220, 0);
    expect(dark.contrast).toBeLessThan(1);
    expect(dark.sharpness).toBe(0);

    const busy = await imageMetrics(await detailed());
    expect(busy.contrast).toBeGreaterThan(50);
    expect(busy.brightness).toBeCloseTo(130, -1);
  });

  it("reports display dimensions for EXIF-rotated photos", async () => {
    const rotated = await sharp(await solid(300, 100, "#808080")).withMetadata({ orientation: 8 }).jpeg().toBuffer();
    const m = await imageMetrics(rotated);
    expect([m.width, m.height]).toEqual([100, 300]);
  });

  it("rejects garbage", async () => {
    await expectValidationError(imageMetrics(new Uint8Array([1, 2, 3, 4])), /couldn't read/);
  });
});

/* ───────────── perceptual hash ───────────── */

describe("perceptualHash", () => {
  it("returns 16 hex chars, stable across resizes/re-encodes and distinct for different images", async () => {
    const original = await scene(800, 600, "a");
    const h1 = await perceptualHash(original);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
    expect(await perceptualHash(original)).toBe(h1);

    const smaller = await sharp(original).resize(320).jpeg({ quality: 60 }).toBuffer();
    const webp = await sharp(original).resize(1200).webp({ quality: 70 }).toBuffer();
    expect(hammingDistance(h1, await perceptualHash(smaller))).toBeLessThanOrEqual(6);
    expect(hammingDistance(h1, await perceptualHash(webp))).toBeLessThanOrEqual(6);

    const other = await perceptualHash(await scene(800, 600, "b"));
    expect(hammingDistance(h1, other)).toBeGreaterThanOrEqual(12);
  });

  it("hammingDistance counts differing bits", () => {
    expect(hammingDistance("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hammingDistance("0f00000000000001", "0000000000000000")).toBe(5);
    expect(hammingDistance("ABCDEF0123456789", "abcdef0123456789")).toBe(0);
    expect(() => hammingDistance("00", "000")).toThrow();
    expect(() => hammingDistance("zz", "00")).toThrow();
  });
});

/* ───────────── AI label + watermark ───────────── */

describe("applyAiLabel / readAiLabel", () => {
  const info = { generator: "fal-ai/flux-lora <v2> & \"co\"", jobId: "job_abc123", createdAt: new Date("2026-11-24T10:20:30.000Z") };

  it("embeds an IPTC trainedAlgorithmicMedia XMP packet in a JPEG and reads it back", async () => {
    const labeled = await applyAiLabel(await scene(300, 200), info);
    expect(labeled.mimeType).toBe("image/jpeg");
    const meta = await sharp(labeled.bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.xmpAsString).toContain('Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"');

    expect(await readAiLabel(labeled.bytes)).toEqual({
      digitalSourceType: TRAINED_ALGORITHMIC_MEDIA,
      generator: info.generator,
      description: `AI-generated with ${APP.name}`,
      jobId: "job_abc123",
      createdAt: "2026-11-24T10:20:30.000Z",
    });
  });

  it("keeps real transparency as PNG", async () => {
    const png = await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } })
      .png()
      .toBuffer();
    const labeled = await applyAiLabel(png, info);
    expect(labeled.mimeType).toBe("image/png");
    expect((await sharp(labeled.bytes).metadata()).hasAlpha).toBe(true);
    expect((await readAiLabel(labeled.bytes))?.jobId).toBe("job_abc123");
  });

  it("returns null for unlabeled or unreadable files", async () => {
    expect(await readAiLabel(await scene(100, 100))).toBeNull();
    expect(await readAiLabel(new Uint8Array([0, 1, 2]))).toBeNull();
  });
});

describe("applyWatermark", () => {
  it("draws a bottom-right label and leaves the rest of the image alone", async () => {
    const input = await solid(800, 600, "#3c8c3c");
    const marked = await applyWatermark(input);
    const a = await rawPixels(input);
    const b = await rawPixels(marked);
    expect([b.width, b.height]).toEqual([800, 600]);
    expect(regionDiff(a, b, 520, 520, 800, 600)).toBeGreaterThan(8);
    expect(regionDiff(a, b, 0, 0, 400, 300)).toBeLessThan(2);
  });

  it("accepts custom text, keeps the AI label and tolerates tiny images", async () => {
    const labeled = await applyAiLabel(await scene(640, 480), { generator: "mock", jobId: "job_1", createdAt: new Date() });
    const marked = await applyWatermark(labeled.bytes, "Custom · AI");
    expect((await readAiLabel(marked))?.jobId).toBe("job_1");

    const tiny = await applyWatermark(await solid(12, 12, "#ffffff"));
    expect((await sharp(tiny).metadata()).width).toBe(12);
  });

  it("keeps PNG output for PNG input", async () => {
    const out = await applyWatermark(await solid(300, 300, "#000000"));
    expect((await sharp(out).metadata()).format).toBe("png");
  });
});

/* ───────────── crop ───────────── */

describe("cropRegion", () => {
  it("pads the box and clamps it to the image", async () => {
    const img = await scene(400, 300);
    const centered = await sharp(await cropRegion(img, { x: 100, y: 100, width: 100, height: 80 })).metadata();
    expect([centered.width, centered.height]).toEqual([150, 120]);

    const unpadded = await sharp(await cropRegion(img, { x: 100, y: 100, width: 100, height: 80 }, 0)).metadata();
    expect([unpadded.width, unpadded.height]).toEqual([100, 80]);

    const corner = await sharp(await cropRegion(img, { x: 350, y: 260, width: 100, height: 100 })).metadata();
    expect([corner.width, corner.height]).toEqual([75, 65]); // 325..400 x 235..300
  });

  it("rejects boxes outside the image", async () => {
    await expectValidationError(cropRegion(await scene(400, 300), { x: 1000, y: 1000, width: 50, height: 50 }), /outside/);
  });
});
