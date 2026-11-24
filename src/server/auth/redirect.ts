/** Open-redirect-safe handling of `?next=` / callback paths. */

const DEFAULT_AFTER_LOGIN = "/app";
const LOGIN_PATH = "/login";
/** Never bounce back into the auth flow itself. */
const NO_RETURN_PREFIXES = ["/login", "/verify", "/api/auth", "/suspended"];

function sameOriginPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  try {
    const base = "http://internal.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** A same-origin relative path to continue to after sign-in, or `/app`. */
export function safeNextPath(raw: string | null | undefined, fallback = DEFAULT_AFTER_LOGIN): string {
  const path = sameOriginPath(raw);
  if (!path) return fallback;
  const bare = path.split(/[?#]/)[0]!;
  if (NO_RETURN_PREFIXES.some((p) => bare === p || bare.startsWith(`${p}/`))) return fallback;
  return path;
}

/** Error landing page for auth flows: `/login` (optionally with its own query), nothing else. */
export function safeLoginPath(raw: string | null | undefined): string {
  const path = sameOriginPath(raw);
  if (!path) return LOGIN_PATH;
  const bare = path.split(/[?#]/)[0]!;
  return bare === LOGIN_PATH ? path : LOGIN_PATH;
}

/** `/login` URL that returns to `next` after sign-in. */
export function loginPathFor(next: string): string {
  return next === DEFAULT_AFTER_LOGIN ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
