/**
 * Runtime module resolution for the local ML stack (server-only).
 *
 * The tfjs/human/nsfwjs packages are listed in `serverExternalPackages`, so they are never
 * bundled: we load them with Node's own `require` at runtime, created with
 * `createRequire(import.meta.url)`. When a bundler rewrote `import.meta.url` to a build-time
 * path that does not exist at runtime (Vercel builds in /vercel/path0 but runs in /var/task),
 * resolution falls back to `process.cwd()`.
 */
import { existsSync, realpathSync } from "node:fs";
import * as nodeModule from "node:module";
import path from "node:path";

type CreateRequire = typeof nodeModule.createRequire;
type NodeRequire = ReturnType<CreateRequire>;

/**
 * Bundlers (webpack/Turbopack) rewrite a literal `createRequire(import.meta.url)` into their own
 * module loader, which cannot resolve the dynamic paths used here. `process.getBuiltinModule`
 * (Node ≥ 20.16 / 22.3) is opaque to them and always returns Node's real implementation.
 */
function nodeCreateRequire(): CreateRequire {
  const getBuiltin = (process as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  const builtin = getBuiltin?.call(process, "node:module") as typeof nodeModule | undefined;
  return builtin?.createRequire ?? nodeModule.createRequire;
}

let cached: NodeRequire[] | undefined;

function bases(): NodeRequire[] {
  if (cached) return cached;
  const create = nodeCreateRequire();
  const list: NodeRequire[] = [];
  try {
    list.push(create(import.meta.url));
  } catch {
    // import.meta.url unavailable or not a file URL in this runtime: fall through to cwd.
  }
  list.push(create(path.join(process.cwd(), "package.json")));
  cached = list;
  return list;
}

/** `require.resolve` against the app's node_modules, trying each base in order. */
export function resolveFromApp(specifier: string): string {
  let lastError: unknown;
  for (const req of bases()) {
    try {
      return req.resolve(specifier);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`safety: cannot resolve "${specifier}" from the app root`, { cause: lastError });
}

/** Load a CommonJS module (package name or absolute path) with Node's real `require`. */
export function requireFromApp<T>(specifier: string): T {
  const resolved = path.isAbsolute(specifier) ? specifier : resolveFromApp(specifier);
  return bases()[0](resolved) as T;
}

/**
 * Load a CommonJS file by absolute path and evict it from the require cache right away
 * (used for nsfwjs' multi-megabyte base64 weight bundles, which are only needed once).
 */
export function requireUncached<T>(absPath: string): T {
  const req = bases()[0];
  const resolved = req.resolve(absPath);
  try {
    return req(resolved) as T;
  } finally {
    delete req.cache[resolved];
  }
}

/**
 * Root directory of an installed package (realpath), found through Node's own lookup paths.
 * Unlike `require.resolve(pkg)` this needs only `<pkg>/package.json`, not the package's main
 * entry: human's main is the tfjs-node build and nsfwjs's main is never used, so neither has
 * to ship in a traced serverless bundle. Used to reach files outside a package's `exports`.
 */
export function packageDir(pkg: string): string {
  for (const req of bases()) {
    for (const dir of req.resolve.paths(pkg) ?? []) {
      const candidate = path.join(dir, pkg);
      if (existsSync(path.join(candidate, "package.json"))) return realpathSync(candidate);
    }
  }
  throw new Error(`safety: package "${pkg}" is not installed (looked from the app root)`);
}
