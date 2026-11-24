/**
 * Route wrapper for the public API v1: API-key auth + per-key rate limit (via `route()`), the
 * operation's required key scope, `X-RateLimit-*` headers and `Cache-Control: no-store`.
 */
import { NextResponse } from "next/server";
import type { ApiKeyRow } from "@/db/types";
import { errors, route, type AuthedRouteContext } from "@/server/http";
import type { ScopedV1Operation, V1Scope } from "@/server/openapi/operations";
import { checkRateLimit } from "@/server/rate-limit";

const RATE_LIMIT = "apiPerMinute" as const;

export type V1Context<P> = AuthedRouteContext<P> & { apiKey: ApiKeyRow };

/** `*` grants every scope. */
export function keyHasScope(key: Pick<ApiKeyRow, "scopes">, scope: V1Scope): boolean {
  return key.scopes.includes("*") || key.scopes.includes(scope);
}

/** Current window of the key's rate limit (cost 0: reads without counting). Never throws. */
async function rateLimitHeaders(apiKeyId: string): Promise<Record<string, string>> {
  try {
    // Same subject route() uses for API-key requests.
    const r = await checkRateLimit(RATE_LIMIT, `key:${apiKeyId}`, 0);
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
  return route<P, "api">({ auth: "api", rateLimit: RATE_LIMIT }, async (ctx) => {
    const { apiKey } = ctx;
    if (!apiKey) throw errors.unauthorized("Missing API key. Send `Authorization: Bearer os_live_...`.");
    if (!keyHasScope(apiKey, op.scope)) {
      throw errors.forbidden(`This API key doesn't have the "${op.scope}" scope required by ${op.operationId}.`);
    }
    const result = await handler({ ...ctx, apiKey });
    const res = result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    for (const [name, value] of Object.entries(await rateLimitHeaders(apiKey.id))) res.headers.set(name, value);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  });
}
