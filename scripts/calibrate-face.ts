/**
 * Calibrate the local face-match threshold (cosine on L2-normalized human/faceres embeddings).
 *
 *   pnpm exec tsx scripts/calibrate-face.ts <dir>              # <dir>/<person>/<image>.jpg|png|webp
 *   pnpm exec tsx scripts/calibrate-face.ts --human-samples    # reproduce the shipped default
 *
 * Options:
 *   --max-far <rate>   target false-accept rate for the suggested threshold (default 0.001)
 *   --json             machine-readable output
 *
 * Use ≥ 50 people with ≥ 3 photos each, resembling real uploads (selfies, varied light/pose).
 * Each image contributes its largest face; images with no face are skipped and reported.
 * Then set LOCAL_FACE_MATCH_THRESHOLD in src/providers/safety/local-face.ts (raising it is
 * always safe; lowering it accepts more different-person matches).
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  describe,
  equalErrorRate,
  errorRates,
  pairScores,
  thresholdForFar,
  thresholdTable,
  type LabeledEmbedding,
} from "../src/providers/safety/face-calibration";
import { createLocalFaceProvider, LOCAL_FACE_MATCH_THRESHOLD } from "../src/providers/safety/local-face";
import { packageEntryDir } from "../src/providers/safety/node-require";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

interface Sample {
  label: string;
  source: string;
  bytes: Uint8Array;
}

function parseArgs(argv: string[]) {
  const args = { dir: undefined as string | undefined, humanSamples: false, json: false, maxFar: 0.001 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--human-samples") args.humanSamples = true;
    else if (a === "--json") args.json = true;
    else if (a === "--max-far") args.maxFar = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log("usage: tsx scripts/calibrate-face.ts <dir> | --human-samples [--max-far 0.001] [--json]");
      process.exit(0);
    } else args.dir = a;
  }
  if (!args.humanSamples && !args.dir) throw new Error("pass a folder of <person>/<image> files or --human-samples");
  if (!(args.maxFar >= 0 && args.maxFar < 1)) throw new Error("--max-far must be in [0, 1)");
  return args;
}

async function loadFolder(dir: string): Promise<Sample[]> {
  const samples: Sample[] = [];
  for (const person of (await readdir(dir)).sort()) {
    const personDir = path.join(dir, person);
    if (!(await stat(personDir)).isDirectory()) continue;
    for (const file of (await readdir(personDir)).sort()) {
      if (!IMAGE_EXT.has(path.extname(file).toLowerCase())) continue;
      const source = path.join(person, file);
      samples.push({ label: person, source, bytes: new Uint8Array(await readFile(path.join(personDir, file))) });
    }
  }
  return samples;
}

/**
 * Built-in set from human's bundled screenshot-facematch.jpg (a grid of ~100 px face crops):
 * row 1 is one person (the library author, 18 photos); rows 3-6 are 72 other faces, each
 * labeled as its own identity (a few may repeat, which only makes the FAR estimate pessimistic).
 * Row 2 mixes the author with others and is skipped.
 */
async function loadHumanSamples(): Promise<Sample[]> {
  const file = path.join(path.dirname(packageEntryDir("@vladmandic/human")), "assets", "screenshot-facematch.jpg");
  const rowsY = [283, 395, 508, 620, 732, 845];
  const rowH = 107;
  const colW = 1920 / 18;
  const pad = Math.round(rowH * 0.25);
  const samples: Sample[] = [];
  for (const r of [0, 2, 3, 4, 5]) {
    for (let c = 0; c < 18; c++) {
      const left = Math.round(c * colW);
      const width = Math.round((c + 1) * colW) - left;
      const buf = await sharp(file)
        .extract({ left, top: rowsY[r], width, height: rowH })
        .extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: "copy" })
        .resize({ width: 300 })
        .jpeg({ quality: 95 })
        .toBuffer();
      samples.push({ label: r === 0 ? "author" : `other-r${r + 1}c${c + 1}`, source: `r${r + 1}c${c + 1}`, bytes: new Uint8Array(buf) });
    }
  }
  return samples;
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : "  n/a");
const pct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "n/a");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const samples = args.humanSamples ? await loadHumanSamples() : await loadFolder(path.resolve(args.dir!));
  const provider = createLocalFaceProvider();
  const embedded: LabeledEmbedding[] = [];
  const skipped: string[] = [];
  const multi: string[] = [];
  const started = performance.now();
  for (const s of samples) {
    const res = await provider.analyze(s.bytes);
    if (res.faces.length === 0) {
      skipped.push(s.source);
      continue;
    }
    if (res.faces.length > 1) multi.push(s.source);
    embedded.push({ label: s.label, source: s.source, embedding: res.faces[0].embedding });
  }
  const elapsedMs = performance.now() - started;

  const scores = pairScores(embedded);
  if (scores.same.length === 0 || scores.different.length === 0) {
    throw new Error("need at least two people and one person with two or more usable photos");
  }
  const report = {
    images: samples.length,
    embedded: embedded.length,
    identities: new Set(embedded.map((e) => e.label)).size,
    skippedNoFace: skipped,
    multipleFacesUsedLargest: multi,
    msPerImage: Math.round(elapsedMs / Math.max(1, samples.length)),
    same: describe(scores.same),
    different: describe(scores.different),
    equalErrorRate: equalErrorRate(scores),
    suggested: {
      [`far<=${args.maxFar}`]: thresholdForFar(scores, args.maxFar),
      "far<=0.01": thresholdForFar(scores, 0.01),
    },
    current: errorRates(scores, LOCAL_FACE_MATCH_THRESHOLD),
    table: thresholdTable(scores, 0.4, 0.8, 0.025),
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`images ${report.images}, embedded ${report.embedded}, identities ${report.identities}, ${report.msPerImage} ms/image`);
  if (skipped.length) console.log(`no face (skipped): ${skipped.join(", ")}`);
  if (multi.length) console.log(`several faces (largest used): ${multi.join(", ")}`);
  console.log("\ncosine similarity      n      min    p05    p25    med    p75    p95    p99    max");
  for (const [name, d] of [
    ["same person", report.same],
    ["different people", report.different],
  ] as const) {
    console.log(
      `${name.padEnd(18)} ${String(d.n).padStart(7)}  ${[d.min, d.p05, d.p25, d.median, d.p75, d.p95, d.p99, d.max].map(fmt).join("  ")}`,
    );
  }
  console.log("\nthreshold   false reject   false accept");
  for (const row of report.table) {
    console.log(`${fmt(row.threshold).padStart(9)}   ${pct(row.falseRejectRate).padStart(12)}   ${pct(row.falseAcceptRate).padStart(12)}`);
  }
  const eer = report.equalErrorRate;
  console.log(`\nequal error rate: ${eer ? `${pct(eer.rate)} at ${fmt(eer.threshold)}` : "n/a"}`);
  for (const [k, v] of Object.entries(report.suggested)) console.log(`lowest threshold with ${k}: ${v ?? "none"}`);
  console.log(
    `current LOCAL_FACE_MATCH_THRESHOLD ${LOCAL_FACE_MATCH_THRESHOLD}: false reject ${pct(report.current.falseRejectRate)}, false accept ${pct(report.current.falseAcceptRate)}`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
