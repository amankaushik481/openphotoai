/**
 * Signs a demo user in without a magic link: the session row and its signed cookies are made by
 * Better Auth itself (internal adapter + `setSessionCookie`), so they are exactly what the
 * magic-link flow would produce: same token format, HMAC signature, cookie names/attributes
 * (`__Secure-` prefix on https) and cookie cache. Session database hooks (ban/deletion checks) run.
 *
 * The work runs inside a one-off Better Auth endpoint called as a plain function: that is the
 * supported way to get a real endpoint context (`ctx.setSignedCookie`) without exposing a route or
 * running the global hooks.
 */
import "server-only";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { env } from "@/lib/env";
import { getAuth } from "@/server/auth/auth";
import { CLIENT_IP_HEADER, clientIpFromHeaders } from "@/server/http";
import { isDemoEmail } from "./constants";

/**
 * Create a session for the demo account `userId` and return the `Set-Cookie` values carrying it.
 * This skips every sign-in proof, so it refuses anything but a demo account while DEMO_MODE is on.
 */
export async function createDemoSessionCookies(userId: string, requestHeaders: Headers): Promise<string[]> {
  if (!env.DEMO_MODE) throw new Error("demo sessions need DEMO_MODE");
  const authContext = await getAuth().$context;

  const signIn = createAuthEndpoint({ method: "POST" }, async (ctx) => {
    const user = await ctx.context.internalAdapter.findUserById(userId);
    if (!user || !isDemoEmail(user.email)) throw new Error(`refusing a demo session for ${userId}: not a demo account`);
    const session = await ctx.context.internalAdapter.createSession(user.id);
    await setSessionCookie(ctx, { session, user });
    return { ok: true };
  });

  // Same IP plumbing as the auth route: Better Auth reads our trusted-proxy IP from CLIENT_IP_HEADER.
  const headers = new Headers(requestHeaders);
  headers.delete(CLIENT_IP_HEADER);
  const ip = clientIpFromHeaders(requestHeaders);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);

  const result = await signIn({
    method: "POST",
    headers,
    // A copy: Better Auth records the new session on the context object it is given.
    context: { ...authContext },
    returnHeaders: true,
  });
  const cookies = result.headers?.getSetCookie() ?? [];
  if (cookies.length === 0) throw new Error("Better Auth set no session cookie");
  return cookies;
}
