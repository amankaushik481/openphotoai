/**
 * Session + API-key authentication helpers. CONTRACT FILE (owner: auth workstream).
 * Route handlers should use `route({ auth })` from src/server/http.ts; server
 * components/pages use `getCurrentUser()` / `requireUserPage()`.
 */
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { headers as nextHeaders } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { cache } from "react";
import { db } from "@/db";
import { apiKeys, user as userTable } from "@/db/schema";
import type { ApiKeyRow, UserRow } from "@/db/types";
import { errors, type AuthMode } from "@/server/http";
import { findActiveApiKey, looksLikeApiKey, planHasApiAccess } from "./api-keys";
import { getAuth } from "./auth";
import { liftExpiredBan } from "./user-policy";

/** lastUsedAt is written at most once per this interval per key. */
const API_KEY_TOUCH_INTERVAL_MS = 60_000;

type AuthResult = { user: UserRow | null; apiKey: ApiKeyRow | null };

/** Fresh user row (app fields are never taken from the session cookie cache). Deleted users resolve to null. */
async function loadUser(userId: string): Promise<UserRow | null> {
  const [row] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
  if (!row || row.deletedAt) return null;
  return liftExpiredBan(row);
}

async function userFromSession(headers: Headers): Promise<UserRow | null> {
  const session = await getAuth().api.getSession({ headers });
  return session ? loadUser(session.user.id) : null;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1] ?? null;
}

/** Resolve the caller for a route. Never throws for missing auth (route() decides). */
export async function resolveRequestAuth(req: NextRequest, mode: AuthMode): Promise<AuthResult> {
  if (mode === "api" || mode === "user_or_api") {
    const token = bearerToken(req);
    if (token && (mode === "api" || looksLikeApiKey(token))) {
      const result = await authenticateApiKey(req);
      // A presented-but-invalid key is an error, not "signed out".
      if (!result) throw errors.unauthorized("Invalid or revoked API key.");
      return result;
    }
    // The public API never falls back to cookies (route() rejects with 401 anyway).
    if (mode === "api") throw errors.unauthorized("Missing API key. Send `Authorization: Bearer os_live_...`.");
  }
  const user = await userFromSession(req.headers);
  return { user, apiKey: null };
}

/** Current user from the session cookie (server components / server actions). Deduped per request. */
export const getCurrentUser = cache(async (): Promise<UserRow | null> => {
  return userFromSession(await nextHeaders());
});

/** For pages: redirects to /login?next=... when signed out, /suspended when banned. */
export async function requireUserPage(nextPath?: string): Promise<UserRow> {
  const user = await getCurrentUser();
  if (!user) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  if (user.banned) redirect("/suspended");
  return user;
}

/** For admin pages: 404s for non-admins. */
export async function requireAdminPage(): Promise<UserRow> {
  const user = await getCurrentUser();
  if (!user || user.banned || user.role !== "admin") notFound();
  return user;
}

/**
 * Authenticate `Authorization: Bearer os_live_...`. Updates lastUsedAt.
 * Returns null for a missing/unknown/revoked key; throws plan_limit when the
 * owner's plan has no API access.
 */
export async function authenticateApiKey(req: Request): Promise<{ user: UserRow; apiKey: ApiKeyRow } | null> {
  const token = bearerToken(req);
  if (!token || !looksLikeApiKey(token)) return null;
  const apiKey = await findActiveApiKey(token);
  if (!apiKey) return null;
  const user = await loadUser(apiKey.userId);
  if (!user) return null;
  if (!planHasApiAccess(user)) {
    throw errors.planLimit("Your plan doesn't include API access. Upgrade to Pro or Studio to use API keys.");
  }
  return { user, apiKey: await touchApiKey(apiKey) };
}

async function touchApiKey(key: ApiKeyRow): Promise<ApiKeyRow> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - API_KEY_TOUCH_INTERVAL_MS);
  if (key.lastUsedAt && key.lastUsedAt > staleBefore) return key;
  // Conditional update: concurrent requests don't all write.
  await db
    .update(apiKeys)
    .set({ lastUsedAt: now })
    .where(and(eq(apiKeys.id, key.id), or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, staleBefore))));
  return { ...key, lastUsedAt: now };
}
