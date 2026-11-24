/**
 * Session + API-key authentication helpers. CONTRACT FILE (owner: auth workstream).
 * Route handlers should use `route({ auth })` from src/server/http.ts; server
 * components/pages use `getCurrentUser()` / `requireUserPage()`.
 */
import type { NextRequest } from "next/server";
import type { ApiKeyRow, UserRow } from "@/db/types";
import type { AuthMode } from "@/server/http";

/** Resolve the caller for a route. Never throws for missing auth (route() decides). */
export async function resolveRequestAuth(
  req: NextRequest,
  mode: AuthMode,
): Promise<{ user: UserRow | null; apiKey: ApiKeyRow | null }> {
  void req;
  void mode;
  throw new Error("not implemented: resolveRequestAuth (auth workstream)");
}

/** Current user from the session cookie (server components / server actions). */
export async function getCurrentUser(): Promise<UserRow | null> {
  throw new Error("not implemented: getCurrentUser (auth workstream)");
}

/** For pages: redirects to /login?next=... when signed out, /suspended when banned. */
export async function requireUserPage(nextPath?: string): Promise<UserRow> {
  void nextPath;
  throw new Error("not implemented: requireUserPage (auth workstream)");
}

/** For admin pages: 404s for non-admins. */
export async function requireAdminPage(): Promise<UserRow> {
  throw new Error("not implemented: requireAdminPage (auth workstream)");
}

/** Authenticate `Authorization: Bearer os_live_...`. Updates lastUsedAt. */
export async function authenticateApiKey(req: Request): Promise<{ user: UserRow; apiKey: ApiKeyRow } | null> {
  void req;
  throw new Error("not implemented: authenticateApiKey (auth workstream)");
}
