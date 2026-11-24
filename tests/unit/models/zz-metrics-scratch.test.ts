import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { imageMetrics, normalizeImage, perceptualHash, hammingDistance } from "@/server/images/process";
import { createMockFaceProvider } from "@/providers/mock/face";
import { decodeMarker } from "@/providers/mock/markers";

it("metrics", async () => {
  const dir = path.resolve("tests/fixtures/selfies");
  const face = createMockFaceProvider();
  const hashes: [string, string][] = [];
  for (const f of readdirSync(dir).sort()) {
    const raw = new Uint8Array(readFileSync(path.join(dir, f)));
    const n = await normalizeImage(raw);
    const m = await imageMetrics(n.bytes);
    const a = await face.analyze(n.bytes);
    const mk = await decodeMarker(n.bytes);
    const h = await perceptualHash(n.bytes);
    hashes.push([f, h]);
    console.log(f, JSON.stringify(m), "faces", a.faces.length, a.faces.map(x => `yaw=${x.yaw} pitch=${x.pitch} age=${x.age}`).join(";"), JSON.stringify(mk), h);
  }
  let minD = 99;
  for (let i = 0; i < hashes.length; i++) for (let j = i + 1; j < hashes.length; j++) {
    const d = hammingDistance(hashes[i][1], hashes[j][1]);
    if (d < 12) console.log("close", hashes[i][0], hashes[j][0], d);
    minD = Math.min(minD, d);
  }
  console.log("min hamming", minD);
});
