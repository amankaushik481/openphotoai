import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { authErrorMessage } from "@/components/auth/auth-errors";
import { proxy } from "@/proxy";
import { loginPathFor, safeLoginPath, safeNextPath } from "@/server/auth/redirect";

describe("safeNextPath", () => {
  it.each([
    [undefined, "/app"],
    ["", "/app"],
    ["/app/models?tab=ready#top", "/app/models?tab=ready#top"],
    ["/admin", "/admin"],
    ["//evil.example.com/app", "/app"],
    ["https://evil.example.com", "/app"],
    ["/\\evil.example.com", "/app"],
    ["javascript:alert(1)", "/app"],
    ["/login?next=/app", "/app"],
    ["/verify?token=x", "/app"],
    ["/api/auth/sign-out", "/app"],
  ])("%s → %s", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });
});

describe("safeLoginPath / loginPathFor", () => {
  it("only allows /login as the error landing page", () => {
    expect(safeLoginPath("/login?next=%2Fapp%2Fgallery")).toBe("/login?next=%2Fapp%2Fgallery");
    expect(safeLoginPath("/app")).toBe("/login");
    expect(safeLoginPath("https://evil.example.com/login")).toBe("/login");
    expect(safeLoginPath(undefined)).toBe("/login");
  });

  it("builds the login URL for a next path", () => {
    expect(loginPathFor("/app")).toBe("/login");
    expect(loginPathFor("/app/models/new")).toBe("/login?next=%2Fapp%2Fmodels%2Fnew");
  });
});

describe("proxy", () => {
  it("redirects signed-out visitors of /app to /login with next", () => {
    const res = proxy(new NextRequest("http://localhost:3000/app/models?tab=ready"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/app/models?tab=ready");
  });

  it("lets requests with a session cookie through (optimistic check only)", () => {
    for (const cookie of ["better-auth.session_token=abc.def", "__Secure-better-auth.session_token=abc.def"]) {
      const res = proxy(new NextRequest("http://localhost:3000/admin", { headers: { cookie } }));
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });
});

describe("authErrorMessage", () => {
  it("maps known codes and falls back to a generic message", () => {
    expect(authErrorMessage(null)).toBeNull();
    expect(authErrorMessage("INVALID_TOKEN")).toMatch(/invalid/i);
    expect(authErrorMessage("ACCOUNT_DELETED")).toMatch(/deleted/i);
    expect(authErrorMessage("something_weird")).toMatch(/try again/i);
  });
});
