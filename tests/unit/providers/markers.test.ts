import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { decodeMarker, encodeMarker, MOCK_IDENTITIES, type Marker } from "@/providers/mock/markers";
import { OTHER_FIXTURE_MARKERS, readFixture, readSelfie, SELFIE_MARKERS } from "../../fixtures";

async function texturedPhoto(width = 1024, height = 1280): Promise<sharp.Sharp> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ac"/><stop offset="1" stop-color="#543"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/><ellipse cx="50%" cy="45%" rx="20%" ry="25%" fill="#e0ac83"/></svg>`;
  return sharp(Buffer.from(svg));
}

async function marked(marker: Partial<Marker>): Promise<Uint8Array> {
  return new Uint8Array(await (await encodeMarker(await texturedPhoto(), marker)).png().toBuffer());
}

describe("mock marker protocol", () => {
  it("round-trips every identity and all fields losslessly", async () => {
    for (const identity of [...MOCK_IDENTITIES, "default"] as const) {
      const marker: Marker = { identity, age: 42, faces: 3, nsfw: true, blurry: false, publicFigure: true };
      expect(await decodeMarker(await marked(marker))).toEqual(marker);
    }
  });

  it("survives JPEG q80, resizing and metadata stripping", async () => {
    const cases: Marker[] = [
      { identity: "alice", age: 15, faces: 1, nsfw: false, blurry: false, publicFigure: false },
      { identity: "bob", age: 30, faces: 2, nsfw: true, blurry: true, publicFigure: false },
      { identity: "oscar", age: 67, faces: 0, nsfw: false, blurry: false, publicFigure: true },
      { identity: "default", age: 18, faces: 4, nsfw: true, blurry: true, publicFigure: true },
    ];
    for (const marker of cases) {
      const png = await marked(marker);
      const jpeg = await sharp(png).withExif({ IFD0: { Copyright: "x" } }).jpeg({ quality: 80 }).toBuffer();
      const resized = await sharp(jpeg).resize(512).jpeg({ quality: 80 }).toBuffer(); // drops metadata
      for (const bytes of [jpeg, resized]) {
        const decoded = await decodeMarker(new Uint8Array(bytes));
        expect(decoded).not.toBeNull();
        expect({ ...decoded, age: 0 }).toEqual({ ...marker, age: 0 });
        expect(Math.abs((decoded?.age ?? 0) - marker.age)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("returns null for unmarked images and non-images", async () => {
    expect(await decodeMarker(new Uint8Array(await (await texturedPhoto()).jpeg().toBuffer()))).toBeNull();
    expect(await decodeMarker(new TextEncoder().encode("not an image"))).toBeNull();
    const tiny = await sharp({ create: { width: 20, height: 4, channels: 3, background: "#f0f" } }).png().toBuffer();
    expect(await decodeMarker(new Uint8Array(tiny))).toBeNull();
  });

  it("decodes the committed fixtures as documented", async () => {
    for (const [name, marker] of Object.entries(SELFIE_MARKERS)) {
      expect(await decodeMarker(readSelfie(name)), name).toEqual(marker);
    }
    for (const [file, marker] of Object.entries(OTHER_FIXTURE_MARKERS)) {
      expect(await decodeMarker(readFixture(file)), file).toEqual(marker);
    }
  });
});
