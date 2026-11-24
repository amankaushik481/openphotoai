#!/usr/bin/env node
/**
 * `node scripts/compile-hints.mjs [distDir]` — runs after `next build` (see the `build` script).
 *
 * Adds V8's explicit compile hint (`//# allFunctionsCalledOnLoad`, Chrome 136+; other engines ignore the
 * comment) to the framework chunks every App Router page loads (`rootMainFiles`: React DOM, the Next
 * router, the Turbopack runtime). Their module factories all run during hydration, and by default V8
 * compiles each one lazily on the main thread at first call: ~30 ms of the ~45 ms hydration bootstrap
 * task on a fast desktop (×4 on a mid-range phone), which Lighthouse counts as Total Blocking Time and
 * adds to its simulated LCP. With the hint the functions are compiled while the script streams in,
 * off the main thread. See https://v8.dev/blog/explicit-compile-hints and docs/KNOWN_ISSUES.md (Performance).
 *
 * Idempotent; filenames (content hashes) are unchanged, and the transform is deterministic per build.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const HINT = "//# allFunctionsCalledOnLoad\n";
const distDir = path.resolve(process.argv[2] ?? ".next");
const manifestPath = path.join(distDir, "build-manifest.json");

if (!existsSync(manifestPath)) {
  console.warn(`compile-hints: ${path.relative(process.cwd(), manifestPath)} not found; skipped.`);
  process.exit(0);
}

const { rootMainFiles = [] } = JSON.parse(readFileSync(manifestPath, "utf8"));
let changed = 0;
for (const file of rootMainFiles) {
  if (!file.endsWith(".js")) continue;
  const p = path.join(distDir, file);
  if (!existsSync(p)) continue;
  const src = readFileSync(p, "utf8");
  if (src.startsWith(HINT)) continue;
  writeFileSync(p, HINT + src);
  changed++;
}
console.log(`compile-hints: ${changed} of ${rootMainFiles.length} framework chunk(s) marked for eager compilation.`);
