/**
 * Better Auth endpoints (magic link, Google OAuth, sessions, sign-out).
 * Better Auth does its own error handling, so this is the one API route that is
 * not wrapped in `route()`.
 */
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";
import { BODY_LIMITS, CLIENT_IP_HEADER, clientIpFromHeaders, errorResponse, readBodyLimited } from "@/server/http";

/**
 * Hand the request to Better Auth with (1) the body capped at BODY_LIMITS.auth before it is
 * buffered and (2) our trusted-proxy client IP in CLIENT_IP_HEADER (any client-sent copy removed),
 * which Better Auth uses for its rate limits and session records.
 */
async function handle(request: Request): Promise<Response> {
  try {
    const headers = new Headers(request.headers);
    headers.delete(CLIENT_IP_HEADER);
    const ip = clientIpFromHeaders(request.headers);
    if (ip) headers.set(CLIENT_IP_HEADER, ip);
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const body = hasBody ? await readBodyLimited(request, BODY_LIMITS.auth) : undefined;
    if (body) {
      // The body is now a buffer; let the new Request describe its own framing.
      headers.delete("content-length");
      headers.delete("transfer-encoding");
    }
    return await getAuth().handler(new Request(request.url, { method: request.method, headers, body }));
  } catch (err) {
    return errorResponse(err);
  }
}

export const { GET, POST } = toNextJsHandler(handle);
