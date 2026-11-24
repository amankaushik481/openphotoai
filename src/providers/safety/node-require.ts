/**
 * Runtime module resolution for the local ML stack (server-only).
 *
 * The tfjs/human/nsfwjs packages are listed in `serverExternalPackages`, so they are never
 * bundled: we load them with a real Node `require` at runtime. `import.meta.url` is the
 * primary base; when a bundler rewrote it to a build-time path that does not exist at runtime
 * (e.g. Vercel builds in /vercel/path0 but runs in /var/task) we fall back to `process.cwd()`.
 */
import { createRequire } from "node:module";
import path from "node:path";

type NodeRequire = ReturnType<typeof createRequire>;

let cached: NodeRequire[] | undefined;

function bases(): NodeRequire[] {
  if (cached) return cached;
  const list: NodeRequire[] = [];
  try {
    list.push(createRequire(import.meta.url));
  } catch {
    // import.meta.url unavailable or not a file URL in this runtime: fall through to cwd.
  }
  list.push(createRequire(path.join(process.cwd(), "package.json")));
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
 * Directory of the file a package's `main` entry resolves to. Used to reach files that the
 * package's `exports` map does not expose (human's dist builds, nsfwjs model bundles).
 */
export function packageEntryDir(pkg: string): string {
  return path.dirname(resolveFromApp(pkg));
}
