/**
 * Magic-link helpers: per-IP send limit and the scanner-safe verify URL.
 *
 * The emailed link points at our `/verify` page instead of the Better Auth API.
 * Corporate link scanners prefetch URLs in emails; landing on a page that needs a
 * click keeps them from consuming the single-use token before the user does.
 */
import { APIError } from "better-auth";
import { env } from "@/lib/env";
import { AppError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const MAGIC_LINK_VERIFY_API_PATH = "/api/auth/magic-link/verify";
export const VERIFY_PAGE_PATH = "/verify";

const FORWARDED_PARAMS = ["token", "callbackURL", "newUserCallbackURL", "errorCallbackURL"] as const;

/** Rewrite Better Auth's API verify URL into our `/verify` page URL (same query params). */
export function toVerifyPageUrl(apiUrl: string, appUrl: string): string {
  const source = new URL(apiUrl);
  const dest = new URL(VERIFY_PAGE_PATH, appUrl);
  for (const key of FORWARDED_PARAMS) {
    const value = source.searchParams.get(key);
    if (value) dest.searchParams.set(key, value);
  }
  return dest.toString();
}

/** Relative URL of the Better Auth endpoint that consumes the token and sets the session cookie. */
export function magicLinkVerifyApiPath(p: { token: string; callbackURL: string; errorCallbackURL: string }): string {
  const qs = new URLSearchParams({ token: p.token, callbackURL: p.callbackURL, errorCallbackURL: p.errorCallbackURL });
  return `${MAGIC_LINK_VERIFY_API_PATH}?${qs.toString()}`;
}

export function ipFromHeaders(headers: Headers | undefined | null): string | null {
  if (!headers) return null;
  const fwd = headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0]?.trim() : headers.get("x-real-ip")?.trim();
  return ip || null;
}

/**
 * Per-IP limit on sending magic links (RATE_LIMITS.magicLinkPerHourPerIp).
 * Skipped when the IP is unknown, and in mock email mode: nothing is actually
 * sent there, and dev/e2e runs share one localhost IP.
 * Throws a Better Auth APIError (429) so the auth client surfaces the message.
 */
export async function enforceMagicLinkRateLimit(headers: Headers | undefined | null): Promise<void> {
  if (env.emailProvider === "mock") return;
  const ip = ipFromHeaders(headers);
  if (!ip) return;
  try {
    await rateLimit("magicLinkPerHourPerIp", `ip:${ip}`);
  } catch (err) {
    if (err instanceof AppError && err.code === "rate_limited") {
      throw APIError.from("TOO_MANY_REQUESTS", { code: "RATE_LIMITED", message: err.message });
    }
    throw err;
  }
}
