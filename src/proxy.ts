/**
 * Optimistic auth redirect only (Next 16 proxy). Real authorization happens in
 * `route()` / `requireUserPage()` — a session cookie here may still be invalid.
 */
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"],
};
