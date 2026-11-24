/**
 * Auth mock for route/page tests. Replaces `@/server/auth/session` with an in-memory "current user":
 *
 *   import { sessionMock } from "../../helpers/session";
 *   vi.mock("@/server/auth/session", () => sessionMock);
 *
 *   beforeEach(() => sessionMock.reset());
 *   sessionMock.setUser(user);                 // signed in (session cookie)
 *   sessionMock.setUser(user, { apiKey });     // authenticated with an API key
 *   sessionMock.setUser(null);                 // signed out -> route() answers 401
 *
 * Every export is a `vi.fn`, so tests can assert calls or override one result with
 * `sessionMock.resolveRequestAuth.mockResolvedValueOnce(...)`.
 */
import { notFound, redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { vi } from "vitest";
import type { ApiKeyRow, UserRow } from "@/db/types";
import type { AuthMode } from "@/server/http";

const state: { user: UserRow | null; apiKey: ApiKeyRow | null } = { user: null, apiKey: null };

export const sessionMock = {
  /** Set (or clear with null) the authenticated user, optionally via an API key. */
  setUser(user: UserRow | null, opts: { apiKey?: ApiKeyRow | null } = {}): void {
    state.user = user;
    state.apiKey = user ? (opts.apiKey ?? null) : null;
  },
  /** Sign out and clear recorded calls. */
  reset(): void {
    state.user = null;
    state.apiKey = null;
    for (const fn of [
      sessionMock.resolveRequestAuth,
      sessionMock.getCurrentUser,
      sessionMock.requireUserPage,
      sessionMock.requireAdminPage,
      sessionMock.authenticateApiKey,
    ]) {
      fn.mockClear();
    }
  },

  resolveRequestAuth: vi.fn<
    (req: NextRequest, mode: AuthMode) => Promise<{ user: UserRow | null; apiKey: ApiKeyRow | null }>
  >(async () => ({ user: state.user, apiKey: state.apiKey })),
  getCurrentUser: vi.fn(async (): Promise<UserRow | null> => state.user),
  requireUserPage: vi.fn(async (nextPath?: string): Promise<UserRow> => {
    if (!state.user) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
    if (state.user.banned) redirect("/suspended");
    return state.user;
  }),
  requireAdminPage: vi.fn(async (): Promise<UserRow> => {
    if (!state.user || state.user.role !== "admin") notFound();
    return state.user;
  }),
  authenticateApiKey: vi.fn<(req: Request) => Promise<{ user: UserRow; apiKey: ApiKeyRow } | null>>(async () =>
    state.user && state.apiKey ? { user: state.user, apiKey: state.apiKey } : null,
  ),
};
