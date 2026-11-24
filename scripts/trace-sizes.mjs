#!/usr/bin/env node
/**
 * `node scripts/trace-sizes.mjs [distDir]` — after `next build`, report the size of every route's
 * serverless function trace (`.next/server/**\/*.nft.json`) and which routes carry the heavy runtime
 * files (ffmpeg, local safety models, PGlite, both sharp libc variants). See next.config.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.argv[2] ?? ".next");
const serverDir = path.join(distDir, "server");
const HEAVY = {
  ffmpeg: /ffmpeg-static\/ffmpeg$/,
  models: /@vladmandic\/human\/models\/|nsfwjs\/dist\/models\//,
  pglite: /@electric-sql\/pglite\//,
  musl: /@img\/sharp-libvips-linuxmusl-/,
  glibc: /@img\/sharp-libvips-linux-/,
};

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith(".nft.json")) yield p;
  }
}

const sizeOf = new Map();
function fileSize(p) {
  if (!sizeOf.has(p)) {
    try {
      const s = statSync(p);
      sizeOf.set(p, s.isFile() ? s.size : 0);
    } catch {
      sizeOf.set(p, 0);
    }
  }
  return sizeOf.get(p);
}

const rows = [];
for (const trace of walk(serverDir)) {
  const { files } = JSON.parse(readFileSync(trace, "utf8"));
  const base = path.dirname(trace);
  let bytes = fileSize(trace.replace(/\.nft\.json$/, ""));
  const flags = new Set();
  for (const f of files) {
    const abs = path.resolve(base, f);
    bytes += fileSize(abs);
    for (const [name, re] of Object.entries(HEAVY)) if (re.test(abs.replaceAll("\\", "/"))) flags.add(name);
  }
  rows.push({ route: path.relative(serverDir, trace).replace(/\.js\.nft\.json$/, ""), mb: bytes / 1e6, flags: [...flags] });
}
if (!rows.length) {
  console.error(`No traces under ${serverDir}: run \`next build\` first.`);
  process.exit(1);
}

rows.sort((a, b) => b.mb - a.mb);
const mbs = rows.map((r) => r.mb).sort((a, b) => a - b);
const fmt = (n) => `${n.toFixed(1)} MB`;
console.log(`${rows.length} traces · min ${fmt(mbs[0])} · median ${fmt(mbs[Math.floor(mbs.length / 2)])} · max ${fmt(mbs.at(-1))}`);
for (const name of Object.keys(HEAVY)) {
  const hit = rows.filter((r) => r.flags.includes(name));
  console.log(`  ${name.padEnd(7)} in ${hit.length} trace(s)${hit.length && hit.length <= 25 ? `: ${hit.map((r) => r.route).join(", ")}` : ""}`);
}
console.log("\nLargest:");
for (const r of rows.slice(0, Number(process.env.TOP) || 15)) console.log(`  ${fmt(r.mb).padStart(9)}  ${r.route}  ${r.flags.join(" ")}`);
