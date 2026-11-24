/**
 * Time-bucketed signing for read URLs (both storage drivers).
 *
 * Signing against "now" gives every response a fresh URL for the same object, so browsers can never
 * reuse a cached image and every poll re-downloads every thumbnail. Instead, URLs are signed against the
 * start of a fixed window: all URLs for one object (same key, TTL and download name) signed within the
 * window are byte-identical. A URL signed at `now` stays valid for at least `ttl` and at most
 * `ttl + window` seconds. Object keys are never reused (ids are unique), so the bytes behind a URL are
 * immutable and can be cached for the URL's whole lifetime.
 */

export const DEFAULT_SIGNED_URL_TTL_SEC = 3600;
/** SigV4 presigned URLs are valid for at most 7 days; the local driver uses the same cap. */
export const MAX_SIGNED_URL_TTL_SEC = 7 * 24 * 3600;
/** Longest signing window (URLs stay identical for up to this long). */
export const SIGNING_WINDOW_SEC = 3600;

export interface SigningWindow {
  /** Effective TTL (clamped to 1s..7d). */
  ttlSec: number;
  /** Window length in seconds (0: TTL too long to bucket, the URL is signed against `now`). */
  windowSec: number;
  /** Unix seconds the URL is signed at (start of the window). */
  signedAtSec: number;
  /** Unix seconds the URL expires at. */
  expiresAtSec: number;
  /** Lifetime from `signedAtSec` (what SigV4 calls `X-Amz-Expires`). */
  expiresInSec: number;
}

export function clampSignedUrlTtl(ttlSec: number | undefined): number {
  const ttl = Math.floor(ttlSec ?? DEFAULT_SIGNED_URL_TTL_SEC);
  return Math.min(Math.max(Number.isFinite(ttl) ? ttl : DEFAULT_SIGNED_URL_TTL_SEC, 1), MAX_SIGNED_URL_TTL_SEC);
}

/**
 * The signing window for a URL requested at `nowMs` with `ttlSec`. The window is never longer than the
 * TTL itself (short-lived URLs stay short-lived: at most 2x the TTL) and never pushes the total lifetime
 * past the 7-day cap.
 */
export function signingWindow(ttlSec: number | undefined, nowMs: number = Date.now()): SigningWindow {
  const ttl = clampSignedUrlTtl(ttlSec);
  const nowSec = Math.floor(nowMs / 1000);
  const windowSec = Math.max(0, Math.min(SIGNING_WINDOW_SEC, ttl, MAX_SIGNED_URL_TTL_SEC - ttl));
  if (windowSec === 0) return { ttlSec: ttl, windowSec, signedAtSec: nowSec, expiresAtSec: nowSec + ttl, expiresInSec: ttl };
  const signedAtSec = Math.floor(nowSec / windowSec) * windowSec;
  const expiresInSec = windowSec + ttl;
  return { ttlSec: ttl, windowSec, signedAtSec, expiresAtSec: signedAtSec + expiresInSec, expiresInSec };
}

/** `Cache-Control` for an immutable object behind a signed URL that is valid for `maxAgeSec` more seconds. */
export function signedObjectCacheControl(maxAgeSec: number): string {
  const maxAge = Math.max(0, Math.min(Math.floor(maxAgeSec), MAX_SIGNED_URL_TTL_SEC));
  return `private, max-age=${maxAge}, immutable`;
}

/** Cache-Control stored on objects at upload time (keys are never reused, so the bytes never change). */
export const IMMUTABLE_OBJECT_CACHE_CONTROL = "private, max-age=31536000, immutable";
