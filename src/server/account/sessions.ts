/**
 * Active sign-in sessions for the settings page: list them and sign out other devices.
 * Session tokens never leave the server (rows are addressed by id). Better Auth's cookie cache is
 * off (docs/reviews/security-2.md, S2-2), so a revoked session stops working on its next request.
 */
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import { session } from "@/db/schema";
import { getAuth } from "@/server/auth/auth";
import { errors } from "@/server/http";

export interface SessionDTO {
  id: string;
  /** The session of the browser making the request. */
  current: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  /** Last time the session was refreshed (Better Auth updates it at most once a day). */
  lastActiveAt: string;
  expiresAt: string;
}

/** The id of the session behind `headers`' cookie, or null. */
export async function currentSessionId(headers: Headers): Promise<string | null> {
  const result = await getAuth().api.getSession({ headers });
  return result?.session.id ?? null;
}

/** The user's unexpired sessions, the current one first, then most recently active. */
export async function listSessions(userId: string, currentId: string | null, now = new Date()): Promise<SessionDTO[]> {
  const rows = await db
    .select({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
    })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, now)))
    .orderBy(desc(session.updatedAt));
  return rows
    .map((r) => ({
      id: r.id,
      current: r.id === currentId,
      userAgent: r.userAgent,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
      lastActiveAt: r.updatedAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/** Sign out one other device. The current session signs out through the normal sign-out. */
export async function revokeSession(userId: string, sessionId: string, currentId: string | null): Promise<void> {
  if (sessionId === currentId) throw errors.validation("That's this device. Use “Sign out” instead.");
  const deleted = await db
    .delete(session)
    .where(and(eq(session.id, sessionId), eq(session.userId, userId)))
    .returning({ id: session.id });
  if (deleted.length === 0) throw errors.notFound("Session");
}

/** Sign out every device except the current one. Returns how many sessions ended. */
export async function revokeOtherSessions(userId: string, currentId: string | null): Promise<number> {
  // Without a known current session this would sign the caller out too: refuse instead.
  if (!currentId) throw errors.unauthorized("Sign in again to manage your devices.");
  const deleted = await db
    .delete(session)
    .where(and(eq(session.userId, userId), ne(session.id, currentId)))
    .returning({ id: session.id });
  return deleted.length;
}
