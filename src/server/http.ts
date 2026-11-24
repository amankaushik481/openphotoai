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
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { ApiKeyRow, UserRow } from "@/db/types";
import type { RateLimitName } from "@/config/rate-limits";
import type { ApiErrorCode } from "@/types/domain";

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

/** Parse + validate a JSON body. Throws AppError(validation_error). */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
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

/**
 * Wrap a Next.js route handler with auth, suspension check, rate limiting and
 * uniform error handling. Returning a plain value sends it as JSON.
 */
export function route<P = Record<string, string>, A extends AuthMode = AuthMode>(
  opts: { auth: A; rateLimit?: RateLimitName | RateLimitName[] },
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
      if (opts.rateLimit) {
        const { rateLimit } = await import("@/server/rate-limit");
        const names = Array.isArray(opts.rateLimit) ? opts.rateLimit : [opts.rateLimit];
        const subject = apiKey ? `key:${apiKey.id}` : user ? `user:${user.id}` : `ip:${clientIp(req)}`;
        for (const name of names) await rateLimit(name, subject);
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

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
