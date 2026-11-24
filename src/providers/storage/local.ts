/**
 * Local-disk storage driver. Files live under `dir`; reads go through
 * `GET /api/files/[...key]?exp&sig&dl` signed with HMAC-SHA256.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import type { StorageProvider } from "@/providers/types";
import { AppError } from "@/server/http";
import { assertSafeKey, assertSafePrefix, encodeKeyPath } from "./keys";

export interface LocalStorageOptions {
  dir: string;
  /** App origin that serves `/api/files/*` (e.g. NEXT_PUBLIC_APP_URL). */
  baseUrl: string;
  secret: string;
}

export interface LocalStorageProvider extends StorageProvider {
  readonly name: "local";
  /** Absolute storage root. */
  readonly dir: string;
  /** Absolute file path for a validated key (never outside `dir`). */
  resolvePath(key: string): string;
  /** Check signed-URL parameters against this instance's secret (signature + expiry). */
  verifySignature(key: string, exp: string | number, sig: string, dl?: string | null): boolean;
}

export const DEFAULT_SIGNED_URL_TTL_SEC = 3600;
export const MAX_SIGNED_URL_TTL_SEC = 7 * 24 * 3600;

/** Derive a purpose-bound key so the app secret is never used directly for file URLs. */
function signingKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("openshoot:local-files:v1").digest();
}

function computeSignature(secret: string, key: string, exp: number, dl: string | null | undefined): string {
  return createHmac("sha256", signingKey(secret))
    .update(`${key}|${exp}|${dl ?? ""}`)
    .digest("base64url");
}

/**
 * Verify a local file URL: HMAC-SHA256 over `key|exp|dl` and `exp` (unix seconds) not in the past.
 * `secret` defaults to the app secret used by `getStorage()`.
 */
export function verifyLocalFileSignature(
  key: string,
  exp: string | number | null | undefined,
  sig: string | null | undefined,
  dl?: string | null,
  opts?: { secret?: string; nowSec?: number },
): boolean {
  if (!sig || exp === null || exp === undefined) return false;
  const expStr = String(exp);
  if (!/^\d{1,12}$/.test(expStr)) return false;
  const expNum = Number(expStr);
  const now = opts?.nowSec ?? Math.floor(Date.now() / 1000);
  if (expNum < now) return false;
  const expected = Buffer.from(computeSignature(opts?.secret ?? env.authSecret, key, expNum, dl || null));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const PRIVATE_HOST =
  /^(localhost|.*\.localhost|.*\.local|0\.0\.0\.0|::1?|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+)$/;

/** True for an https origin that is not localhost / a private address. */
export function isPublicHttpsUrl(baseUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return url.protocol === "https:" && !PRIVATE_HOST.test(host);
}

function errCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : undefined;
}

async function countFiles(dir: string): Promise<number> {
  const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => !e.isDirectory()).length;
}

export function createLocalStorage(opts: LocalStorageOptions): LocalStorageProvider {
  const root = path.resolve(opts.dir);
  const baseUrl = opts.baseUrl.replace(/\/+$/, "");
  const secret = opts.secret;
  if (!secret) throw new Error("createLocalStorage: a signing secret is required");

  const inside = (segments: string[]): string => {
    const p = path.resolve(root, ...segments);
    if (p !== root && !p.startsWith(root + path.sep)) throw new Error("Invalid storage key: escapes storage root");
    return p;
  };
  const resolvePath = (key: string) => inside(assertSafeKey(key));

  return {
    name: "local",
    publiclyReachable: isPublicHttpsUrl(baseUrl),
    dir: root,
    resolvePath,

    // Content-Type is derived from the key's extension when serving, so PutOptions are not persisted.
    async put(key: string, body: Uint8Array): Promise<void> {
      const file = resolvePath(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      // Write-then-rename so readers never observe a partially written file.
      const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
      try {
        await fs.writeFile(tmp, body);
        await fs.rename(tmp, file);
      } catch (err) {
        await fs.rm(tmp, { force: true });
        throw err;
      }
    },

    async get(key: string): Promise<Uint8Array> {
      try {
        return await fs.readFile(resolvePath(key));
      } catch (err) {
        const code = errCode(err);
        if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") throw new AppError("not_found", "File not found.");
        throw err;
      }
    },

    async exists(key: string): Promise<boolean> {
      try {
        return (await fs.stat(resolvePath(key))).isFile();
      } catch (err) {
        const code = errCode(err);
        if (code === "ENOENT" || code === "ENOTDIR") return false;
        throw err;
      }
    },

    async delete(key: string): Promise<void> {
      try {
        await fs.unlink(resolvePath(key));
      } catch (err) {
        const code = errCode(err);
        if (code !== "ENOENT" && code !== "ENOTDIR") throw err;
      }
    },

    // S3 semantics: every key that starts with `prefix` (string prefix, not only whole directories).
    async deletePrefix(prefix: string): Promise<number> {
      const { dirSegments, namePrefix } = assertSafePrefix(prefix);
      const dir = inside(dirSegments);
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (err) {
        const code = errCode(err);
        if (code === "ENOENT" || code === "ENOTDIR") return 0;
        throw err;
      }
      let deleted = 0;
      for (const entry of entries) {
        if (!entry.name.startsWith(namePrefix)) continue;
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          deleted += await countFiles(p);
          await fs.rm(p, { recursive: true, force: true });
        } else {
          await fs.rm(p, { force: true });
          deleted += 1;
        }
      }
      return deleted;
    },

    async getSignedUrl(key: string, o?: { expiresInSec?: number; downloadName?: string }): Promise<string> {
      assertSafeKey(key);
      const ttl = Math.min(Math.max(Math.floor(o?.expiresInSec ?? DEFAULT_SIGNED_URL_TTL_SEC), 1), MAX_SIGNED_URL_TTL_SEC);
      const exp = Math.floor(Date.now() / 1000) + ttl;
      const dl = o?.downloadName || null;
      const params = new URLSearchParams({ exp: String(exp), sig: computeSignature(secret, key, exp, dl) });
      if (dl) params.set("dl", dl);
      return `${baseUrl}/api/files/${encodeKeyPath(key)}?${params.toString()}`;
    },

    verifySignature(key, exp, sig, dl) {
      return verifyLocalFileSignature(key, exp, sig, dl, { secret });
    },
  };
}

export function isLocalStorage(p: StorageProvider): p is LocalStorageProvider {
  const candidate = p as Partial<LocalStorageProvider>;
  return p.name === "local" && typeof candidate.resolvePath === "function" && typeof candidate.verifySignature === "function";
}
