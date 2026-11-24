/**
 * Magic-link helpers: per-IP send limit and the scanner-safe verify URL.
 *
 * The emailed link points at our `/verify` page instead of the Better Auth API.
 * Corporate link scanners prefetch URLs in emails; landing on a page that needs a
 * click keeps them from consuming the single-use token before the user does.
 */
import { createHash } from "node:crypto";
import { APIError } from "better-auth";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { verification } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError, clientIpFromHeaders } from "@/server/http";
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

/**
 * Email address a still-valid magic-link token signs in as (null when unknown, used or expired).
 * Read-only: it never consumes the token. The /verify page shows it so a victim who was sent an
 * attacker's link (login CSRF) sees it is not their address before clicking.
 * Mirrors Better Auth's storage with `storeToken: "hashed"`: identifier `magic-link:<b64url sha256>`.
 */
export async function pendingMagicLinkEmail(token: string): Promise<string | null> {
  if (!token || token.length > 256) return null;
  const identifier = `magic-link:${createHash("sha256").update(token).digest("base64url")}`;
  const [row] = await db
    .select({ value: verification.value })
    .from(verification)
    .where(and(eq(verification.identifier, identifier), gt(verification.expiresAt, new Date())))
    .orderBy(desc(verification.createdAt))
    .limit(1);
  if (!row) return null;
  try {
    const value = JSON.parse(row.value) as { email?: unknown };
    return typeof value.email === "string" ? value.email : null;
  } catch {
    return null;
  }
}

/** Client IP via the trusted-proxy rules of `clientIpFromHeaders` (TRUSTED_PROXY_HOPS). */
export function ipFromHeaders(headers: Headers | undefined | null): string | null {
  return headers ? clientIpFromHeaders(headers) : null;
}

/** Rate-limit subject for a recipient: hashed, so the limiter table never stores addresses. */
function recipientSubject(email: string): string {
  return `email:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32)}`;
}

/**
 * Limits on sending magic links: per recipient (RATE_LIMITS.magicLinkPerHourPerEmail, stops
 * mail-bombing one address from many IPs) and per client IP (magicLinkPerHourPerIp, skipped when
 * the IP is unknown). Both are skipped in mock email mode: nothing is actually sent there, and
 * dev/e2e runs share one localhost IP and test addresses.
 * Throws a Better Auth APIError (429) so the auth client surfaces the message.
 */
export async function enforceMagicLinkRateLimit(headers: Headers | undefined | null, email?: string): Promise<void> {
  if (env.emailProvider === "mock") return;
  const ip = ipFromHeaders(headers);
  try {
    if (email) await rateLimit("magicLinkPerHourPerEmail", recipientSubject(email));
    if (ip) await rateLimit("magicLinkPerHourPerIp", `ip:${ip}`);
  } catch (err) {
    if (err instanceof AppError && err.code === "rate_limited") {
      throw APIError.from("TOO_MANY_REQUESTS", { code: "RATE_LIMITED", message: err.message });
    }
    throw err;
  }
}
