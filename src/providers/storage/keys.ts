/**
 * Storage key rules shared by every storage driver.
 *
 * Keys are relative, "/"-separated paths built by `storageKeys.*`. Anything that could
 * escape the storage root (or behave differently across drivers) is rejected.
 */
const MAX_KEY_LENGTH = 1024;

function invalid(what: string, value: string): Error {
  return new Error(`Invalid storage ${what}: ${JSON.stringify(value.slice(0, 120))}`);
}

function checkCommon(value: string, what: string): void {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_KEY_LENGTH) throw invalid(what, String(value));
  // Null bytes, backslashes (Windows separators) and other control characters are never valid.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) throw invalid(what, value);
  // Absolute POSIX paths and Windows drive letters.
  if (value.startsWith("/") || /^[a-zA-Z]:/.test(value)) throw invalid(what, value);
}

function checkSegments(segments: string[], what: string, value: string): void {
  for (const s of segments) {
    if (s === "" || s === "." || s === "..") throw invalid(what, value);
  }
}

/** Validate an object key (e.g. `users/u1/media/m1.jpg`). Returns its path segments. */
export function assertSafeKey(key: string): string[] {
  checkCommon(key, "key");
  const segments = key.split("/");
  checkSegments(segments, "key", key);
  return segments;
}

/**
 * Validate a prefix (S3 semantics: plain string prefix, usually ending in "/").
 * Returns the directory segments and the trailing name prefix ("" when the prefix ends in "/").
 */
export function assertSafePrefix(prefix: string): { dirSegments: string[]; namePrefix: string } {
  checkCommon(prefix, "prefix");
  const segments = prefix.split("/");
  const namePrefix = segments.pop() ?? "";
  checkSegments(segments, "prefix", prefix);
  if (namePrefix === "." || namePrefix === "..") throw invalid("prefix", prefix);
  return { dirSegments: segments, namePrefix };
}

/** Percent-encode each path segment of a key for use in a URL path. */
export function encodeKeyPath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/** RFC 6266 `Content-Disposition: attachment` with an ASCII fallback and a UTF-8 filename*. */
export function attachmentDisposition(filename: string): string {
  const cleaned = filename.replace(/[\u0000-\u001f\u007f/\\]/g, "").trim() || "download";
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, "_").replace(/["%;]/g, "_");
  const encoded = encodeURIComponent(cleaned).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  zip: "application/zip",
  json: "application/json",
  txt: "text/plain; charset=utf-8",
};

/** Content-Type derived from a key's extension (`application/octet-stream` when unknown). */
export function contentTypeForKey(key: string): string {
  const dot = key.lastIndexOf(".");
  const ext = dot >= 0 ? key.slice(dot + 1).toLowerCase() : "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}
