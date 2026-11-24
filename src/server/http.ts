/**
 * HTTP helpers for route handlers. CONTRACT FILE.
 *
 *   export const POST = route({ auth: "user", rateLimit: "jobsPerMinute" }, async ({ req, user, params }) => {
 *     const body = await parseBody(req, createJobRequest);
 *     return { job };                       // plain objects are returned as JSON (200)
 *   });
 *
 * Every error becomes `{ error: { code, message, details? } }` with a matching status.
 */
import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { ApiKeyRow, UserRow } from "@/db/types";
import type { RateLimitName } from "@/config/rate-limits";
import { env } from "@/lib/env";
import type { ApiErrorCode, ApiKeyScope } from "@/types/domain";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  suspended: 403,
  not_found: 404,
  validation_error: 400,
  insufficient_credits: 402,
  plan_limit: 403,
  rate_limited: 429,
  content_blocked: 422,
  consent_required: 422,
  conflict: 409,
  payload_too_large: 413,
  provider_error: 502,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const errors = {
  unauthorized: (m = "Please sign in.") => new AppError("unauthorized", m),
  forbidden: (m = "You don't have access to this.") => new AppError("forbidden", m),
  notFound: (what = "Resource") => new AppError("not_found", `${what} not found.`),
  validation: (m: string, details?: unknown) => new AppError("validation_error", m, details),
  insufficientCredits: (needed: number, balance: number) =>
    new AppError("insufficient_credits", `This needs ${needed} credits; you have ${balance}.`, { needed, balance }),
  rateLimited: (retryAfterSec: number) =>
    new AppError("rate_limited", `Too many requests. Try again in ${retryAfterSec}s.`, { retryAfterSec }),
  contentBlocked: (m = "This request was blocked by our safety rules.", details?: unknown) =>
    new AppError("content_blocked", m, details),
  conflict: (m: string) => new AppError("conflict", m),
  planLimit: (m: string) => new AppError("plan_limit", m),
  suspended: () => new AppError("suspended", "Your account is suspended. Contact support."),
  provider: (m = "The AI provider failed. Your credits were refunded.") => new AppError("provider_error", m),
};

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    const headers: Record<string, string> = {};
    if (err.code === "rate_limited" && err.details && typeof err.details === "object" && "retryAfterSec" in err.details) {
      headers["Retry-After"] = String((err.details as { retryAfterSec: number }).retryAfterSec);
    }
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } },
      { status: err.status, headers },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Invalid request.", details: err.issues } },
      { status: 400 },
    );
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong." } }, { status: 500 });
}

/** Request body caps, enforced while streaming (before anything is buffered in full). */
export const BODY_LIMITS = {
  /** JSON API bodies (parseBody). */
  json: 1024 * 1024,
  /** Provider webhooks: read in full before the signature check, so keep this tight. */
  webhook: 4 * 1024 * 1024,
  /** Better Auth endpoints (magic-link sign-in, sign-out, …). */
  auth: 64 * 1024,
} as const;

const payloadTooLarge = (maxBytes: number) => {
  const size = maxBytes >= 1024 * 1024 ? `${Math.round(maxBytes / (1024 * 1024))} MB` : `${Math.round(maxBytes / 1024)} KB`;
  return new AppError("payload_too_large", `The request body is too large (max ${size}).`);
};

/**
 * Read the request body with a hard cap: a declared Content-Length above `maxBytes` is refused
 * up front, and a chunked/undeclared body is cut off (413) as soon as it passes the cap, so a
 * client can never make the server buffer more than `maxBytes`.
 */
export async function readBodyLimited(req: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = req.headers.get("content-length");
  if (declared !== null && declared.trim() !== "") {
    const length = Number(declared);
    if (!Number.isFinite(length) || length < 0) throw errors.validation("Invalid Content-Length.");
    if (length > maxBytes) throw payloadTooLarge(maxBytes);
  }
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw payloadTooLarge(maxBytes);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** `req.text()` with a size cap (see readBodyLimited). */
export async function readTextLimited(req: Request, maxBytes: number): Promise<string> {
  return new TextDecoder().decode(await readBodyLimited(req, maxBytes));
}

/**
 * `req.formData()` with a size cap (see readBodyLimited). Throws payload_too_large past the cap;
 * a malformed body rejects like `formData()` does (callers map that to a validation error).
 */
export async function readFormDataLimited(req: Request, maxBytes: number): Promise<FormData> {
  const bytes = await readBodyLimited(req, maxBytes);
  return new Response(bytes, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
}

/** Parse + validate a JSON body (capped at BODY_LIMITS.json). Throws AppError(validation_error). */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const text = await readTextLimited(req, BODY_LIMITS.json);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw errors.validation("Body must be valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw errors.validation("Invalid request body.", parsed.error.issues);
  return parsed.data;
}

/** Parse + validate URL search params (as a plain object of strings). */
export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw errors.validation("Invalid query parameters.", parsed.error.issues);
  return parsed.data;
}

export type AuthMode =
  | "public" // no auth; user is resolved if a session exists
  | "user" // session cookie required
  | "admin" // session + role admin
  | "api" // public API: Bearer API key required
  | "user_or_api"; // session OR API key

export interface RouteContext<P> {
  req: NextRequest;
  params: P;
  user: UserRow | null;
  apiKey: ApiKeyRow | null;
}

export interface AuthedRouteContext<P> extends RouteContext<P> {
  user: UserRow;
}

type Handler<P, A extends AuthMode> = (
  ctx: A extends "public" ? RouteContext<P> : AuthedRouteContext<P>,
) => Promise<unknown>;

/** A scope an API key needs for a route (`*` keys have every scope). */
export type ApiKeyRouteScope = Exclude<ApiKeyScope, "*">;

/** Per-key limit applied to every API-key request, whatever the route. */
const API_KEY_RATE_LIMIT = "apiPerMinute" satisfies RateLimitName;

export function apiKeyHasScope(key: Pick<ApiKeyRow, "scopes">, scope: ApiKeyRouteScope): boolean {
  return key.scopes.includes("*") || key.scopes.includes(scope);
}

/** Reads need `read`; anything that creates or changes something (jobs, batches, uploads) needs `generate`. */
function defaultApiKeyScope(method: string): ApiKeyRouteScope {
  return method === "GET" || method === "HEAD" ? "read" : "generate";
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated writes (on top of SameSite=Lax): browsers send
 * `Sec-Fetch-Site` (all current ones) or at least `Origin` on POST/PATCH/DELETE, and both must say
 * "this origin". Requests with neither header are non-browser clients, which carry no ambient cookies
 * unless the caller put them there itself.
 */
export function isSameOriginRequest(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = req.headers.get("origin");
  if (origin === null) return true;
  return origin === new URL(req.url).origin || origin === new URL(env.NEXT_PUBLIC_APP_URL).origin;
}

/**
 * Wrap a Next.js route handler with auth, API-key scope check, CSRF check, suspension check,
 * rate limiting and uniform error handling. Returning a plain value sends it as JSON.
 *
 * API-key requests (auth "api" / "user_or_api") need `scope` (default: `read` for GET/HEAD,
 * `generate` otherwise) and always count against the per-key `apiPerMinute` limit.
 */
export function route<P = Record<string, string>, A extends AuthMode = AuthMode>(
  opts: { auth: A; rateLimit?: RateLimitName | RateLimitName[]; scope?: ApiKeyRouteScope },
  handler: Handler<P, A>,
) {
  return async (req: NextRequest, segment: { params: Promise<P> }): Promise<Response> => {
    try {
      // Lazy imports keep this module light for tests that mock auth/rate-limit.
      const { resolveRequestAuth } = await import("@/server/auth/session");
      const { user, apiKey } = await resolveRequestAuth(req, opts.auth);
      if (opts.auth !== "public" && !user) throw errors.unauthorized();
      if (user?.banned) throw errors.suspended();
      if (opts.auth === "admin" && user?.role !== "admin") throw errors.forbidden();
      if (apiKey) {
        const scope = opts.scope ?? defaultApiKeyScope(req.method);
        if (!apiKeyHasScope(apiKey, scope)) {
          throw errors.forbidden(`This API key doesn't have the "${scope}" scope this endpoint requires.`);
        }
      } else if (user && !SAFE_METHODS.has(req.method) && !isSameOriginRequest(req)) {
        throw errors.forbidden("Cross-site request refused.");
      }
      const names: RateLimitName[] = opts.rateLimit ? ([] as RateLimitName[]).concat(opts.rateLimit) : [];
      if (apiKey && !names.includes(API_KEY_RATE_LIMIT)) names.unshift(API_KEY_RATE_LIMIT);
      if (names.length) {
        const { rateLimit } = await import("@/server/rate-limit");
        for (const name of names) {
          // apiPerMinute is per key; everything else per account, so extra keys don't multiply limits.
          const subject =
            apiKey && name === API_KEY_RATE_LIMIT ? `key:${apiKey.id}` : user ? `user:${user.id}` : `ip:${clientIp(req)}`;
          await rateLimit(name, subject);
        }
      }
      const params = (segment?.params ? await segment.params : {}) as P;
      const result = await (handler as Handler<P, AuthMode>)({ req, params, user, apiKey } as AuthedRouteContext<P>);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Header carrying our resolved client IP to Better Auth (set by the auth route, never trusted from clients). */
export const CLIENT_IP_HEADER = "x-openshoot-client-ip";

function normalizeIp(value: string | undefined | null): string | null {
  let ip = value?.trim();
  if (!ip) return null;
  // "[2001:db8::1]:443" / "203.0.113.7:51234" (some proxies include the port)
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) ip = bracketed[1]!;
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  if (!isIP(ip)) return null;
  return ip.toLowerCase().replace(/^::ffff:(\d{1,3}(\.\d{1,3}){3})$/, "$1");
}

/**
 * Client IP from the trusted reverse-proxy chain, or null when it can't be known.
 *
 * Every proxy appends the address it received the request from to X-Forwarded-For; anything to the
 * left of what our own proxies added came from the client and is ignored. With N trusted hops
 * (TRUSTED_PROXY_HOPS; 1 on Vercel, else 0) the client is the Nth entry from the right. With 0 hops
 * no forwarded header is trusted (Next.js only fills X-Forwarded-For when the client didn't send
 * one), so the IP is unknown. X-Real-IP is only read behind a trusted proxy that sends no XFF.
 */
export function clientIpFromHeaders(headers: Headers, hops: number = env.trustedProxyHops): string | null {
  if (hops <= 0) return null;
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Fewer entries than hops: the request skipped a proxy; the leftmost entry is the best we have.
  if (chain.length > 0) return normalizeIp(chain[Math.max(chain.length - hops, 0)]);
  return normalizeIp(headers.get("x-real-ip"));
}

let warnedUntrustedProxy = false;

/** Client IP for rate limits and consent records ("unknown" when not determinable; see clientIpFromHeaders). */
export function clientIp(req: Request): string {
  const ip = clientIpFromHeaders(req.headers);
  if (!ip && !warnedUntrustedProxy && env.isProd && env.trustedProxyHops === 0) {
    const xff = req.headers.get("x-forwarded-for") ?? "";
    if (xff.includes(",") || req.headers.has("x-real-ip")) {
      warnedUntrustedProxy = true;
      console.warn(
        "[http] Requests arrive through a reverse proxy but TRUSTED_PROXY_HOPS is 0, so client IPs are unknown " +
          "and per-IP rate limits are shared by everyone. Set TRUSTED_PROXY_HOPS (see .env.example).",
      );
    }
  }
  return ip ?? "unknown";
}

/** The raw forwarded headers, kept next to the resolved IP as evidence (consent records). */
export function forwardedChain(req: Request): { xForwardedFor: string | null; xRealIp: string | null } {
  const cap = (v: string | null) => (v ? v.slice(0, 512) : null);
  return { xForwardedFor: cap(req.headers.get("x-forwarded-for")), xRealIp: cap(req.headers.get("x-real-ip")) };
}
