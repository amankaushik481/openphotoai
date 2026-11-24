/**
 * Route wrapper for the public API v1: API-key auth + per-key rate limit (via `route()`), the
 * operation's required key scope, `X-RateLimit-*` headers and `Cache-Control: no-store`.
 */
import { NextResponse } from "next/server";
import type { ApiKeyRow } from "@/db/types";
import { apiKeyHasScope, errors, route, type AuthedRouteContext } from "@/server/http";
import type { ScopedV1Operation, V1Scope } from "@/server/openapi/operations";
import { peekRateLimit } from "@/server/rate-limit";

const RATE_LIMIT = "apiPerMinute" as const;

export type V1Context<P> = AuthedRouteContext<P> & { apiKey: ApiKeyRow };

/** `*` grants every scope. */
export function keyHasScope(key: Pick<ApiKeyRow, "scopes">, scope: V1Scope): boolean {
  return apiKeyHasScope(key, scope);
}

/** Current window of the key's rate limit (read-only: doesn't count a hit). Never throws. */
async function rateLimitHeaders(apiKeyId: string): Promise<Record<string, string>> {
  try {
    // Same subject route() uses for API-key requests.
    const r = await peekRateLimit(RATE_LIMIT, `key:${apiKeyId}`);
    return {
      "X-RateLimit-Limit": String(r.limit),
      "X-RateLimit-Remaining": String(r.remaining),
      "X-RateLimit-Reset": String(Math.ceil(r.resetAt.getTime() / 1000)),
    };
  } catch (err) {
    console.warn("[api/v1] rate limit headers unavailable:", err instanceof Error ? err.message : err);
    return {};
  }
}

export function v1Route<P = Record<string, never>>(
  op: ScopedV1Operation,
  handler: (ctx: V1Context<P>) => Promise<unknown>,
) {
  // route() enforces the operation's scope and the per-key limit for every API-key request.
  return route<P, "api">({ auth: "api", rateLimit: RATE_LIMIT, scope: op.scope }, async (ctx) => {
    const { apiKey } = ctx;
    if (!apiKey) throw errors.unauthorized("Missing API key. Send `Authorization: Bearer os_live_...`.");
    const result = await handler({ ...ctx, apiKey });
    const res = result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    for (const [name, value] of Object.entries(await rateLimitHeaders(apiKey.id))) res.headers.set(name, value);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  });
}
