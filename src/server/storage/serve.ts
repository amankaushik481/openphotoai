/**
 * Serves local-driver files for `GET/HEAD /api/files/[...key]`.
 * The HMAC signature in the URL is the authorization (see `createLocalStorage().getSignedUrl`).
 */
import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { isLocalStorage } from "@/providers/storage/local";
import { attachmentDisposition, contentTypeForKey } from "@/providers/storage/keys";
import { signedObjectCacheControl } from "@/providers/storage/url-window";
import { AppError, errorResponse, errors } from "@/server/http";
import { getStorage } from "./index";

export type ByteRange = { start: number; end: number };

/**
 * Parse a single `Range: bytes=...` header. Returns `null` to serve the whole file (no header,
 * other units, or multiple ranges — allowed by RFC 9110) and "unsatisfiable" for a 416.
 */
export function parseRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!m) return null;
  const [, startStr = "", endStr = ""] = m;
  if (startStr === "" && endStr === "") return null;
  if (size === 0) return "unsatisfiable";
  if (startStr === "") {
    const suffix = Number(endStr);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(startStr);
  const end = endStr === "" ? size - 1 : Math.min(Number(endStr), size - 1);
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

const forbidden = () => new AppError("forbidden", "This link has expired or is invalid.");

export async function serveLocalFile(req: Request, key: string, opts: { head?: boolean } = {}): Promise<Response> {
  try {
    const storage = getStorage();
    // S3 serves its own presigned URLs; this endpoint only exists for the local driver.
    if (!isLocalStorage(storage)) throw errors.notFound("File");

    const params = new URL(req.url).searchParams;
    const dl = params.get("dl");
    const exp = params.get("exp") ?? "";
    if (!storage.verifySignature(key, exp, params.get("sig") ?? "", dl)) throw forbidden();

    let file: string;
    try {
      file = storage.resolvePath(key);
    } catch {
      throw errors.notFound("File");
    }
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile()) throw errors.notFound("File");

    const size = stat.size;
    const headers = new Headers({
      "Content-Type": contentTypeForKey(key),
      // Keys are never reused and URLs are stable per signing window: cache until the URL expires.
      "Cache-Control": signedObjectCacheControl(Number(exp) - Math.floor(Date.now() / 1000)),
      "Accept-Ranges": "bytes",
      "Last-Modified": stat.mtime.toUTCString(),
      "X-Content-Type-Options": "nosniff",
      // User files are never active content, even if opened directly.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
    if (dl) headers.set("Content-Disposition", attachmentDisposition(dl));

    const range = parseRange(req.headers.get("range"), size);
    if (range === "unsatisfiable") {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    const length = size === 0 ? 0 : end - start + 1;
    headers.set("Content-Length", String(length));
    if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    const status = range ? 206 : 200;

    if (opts.head || length === 0) return new Response(null, { status, headers });
    const body = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream<Uint8Array>;
    return new Response(body, { status, headers });
  } catch (err) {
    return errorResponse(err);
  }
}
