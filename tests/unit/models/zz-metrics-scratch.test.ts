import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { it } from "vitest";
import { cropRegion, imageMetrics, normalizeImage } from "@/server/images/process";
import { createMockFaceProvider } from "@/providers/mock/face";

it("metrics", async () => {
  const dir = path.resolve("tests/fixtures/selfies");
  const face = createMockFaceProvider();
  for (const f of readdirSync(dir).sort()) {
    const raw = new Uint8Array(readFileSync(path.join(dir, f)));
    const n = await normalizeImage(raw);
    const a = await face.analyze(n.bytes);
    const box = a.faces[0]!.box;
    const crop = await cropRegion(n.bytes, box, 0.1);
    const r = new Uint8Array(await sharp(crop).resize({ width: 384, height: 384, fit: "inside", withoutEnlargement: true }).png().toBuffer());
    const m = await imageMetrics(r);
    const gm = await imageMetrics(n.bytes);
    console.log(f, "global", JSON.stringify(gm), "face", JSON.stringify(m));
  }
});
