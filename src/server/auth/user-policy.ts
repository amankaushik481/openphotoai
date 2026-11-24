/**
 * Account policy used by the Better Auth hooks and by request auth: email
 * normalization, admin promotion via ADMIN_EMAILS, ban/deletion checks and the
 * post-signup side effects (bonus credits + welcome email).
 *
 * Kept separate from `auth.ts` so the logic is testable without the HTTP layer.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { env } from "@/lib/env";
import type { UserRole } from "@/types/domain";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAdminEmail(email: string, adminEmails: readonly string[]): boolean {
  return adminEmails.includes(normalizeEmail(email));
}

/**
 * Applied to every user before insert: lowercase email and `role` derived from
 * ADMIN_EMAILS (never from client input).
 */
export function prepareNewUser<T extends { email: string }>(
  data: T,
  adminEmails: readonly string[],
): T & { email: string; role: UserRole } {
  const email = normalizeEmail(data.email);
  return { ...data, email, role: isAdminEmail(email, adminEmails) ? "admin" : "user" };
}

type BanFields = Pick<UserRow, "banned" | "banExpires">;

export function isBanExpired(u: BanFields, now = new Date()): boolean {
  return Boolean(u.banned && u.banExpires && u.banExpires.getTime() <= now.getTime());
}

export type SignInBlock = "banned" | "deleted";

/** Why this user may not hold a session, or null when they may. */
export function signInBlockReason(
  u: BanFields & Pick<UserRow, "deletedAt">,
  now = new Date(),
): SignInBlock | null {
  if (u.deletedAt) return "deleted";
  if (u.banned && !isBanExpired(u, now)) return "banned";
  return null;
}

/** Clears a ban whose `banExpires` has passed. Returns the (possibly updated) row. */
export async function liftExpiredBan(row: UserRow): Promise<UserRow> {
  if (!isBanExpired(row)) return row;
  const [updated] = await db
    .update(userTable)
    .set({ banned: false, banReason: null, banExpires: null })
    .where(eq(userTable.id, row.id))
    .returning();
  return updated ?? row;
}

/**
 * Runs before Better Auth creates a session. Lifts expired bans, promotes
 * ADMIN_EMAILS users added after signup, and reports whether sign-in is blocked.
 */
export async function admitSignIn(userId: string): Promise<SignInBlock | null> {
  const [found] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
  if (!found) return null; // Better Auth fails on its own for unknown users.
  const row = await liftExpiredBan(found);
  const block = signInBlockReason(row);
  if (!block && row.role !== "admin" && isAdminEmail(row.email, env.ADMIN_EMAILS)) {
    await db.update(userTable).set({ role: "admin" }).where(eq(userTable.id, row.id));
  }
  return block;
}

/**
 * Post-signup side effects. Never throws: a failed bonus grant or email must not
 * break signup (the grant is idempotent and can be re-applied by an admin).
 */
export async function onUserCreated(u: { id: string; email: string; name?: string | null }): Promise<void> {
  const bonus = env.SIGNUP_BONUS_CREDITS;
  if (bonus > 0) {
    try {
      const { applyCredit } = await import("@/server/credits/ledger");
      await applyCredit({
        userId: u.id,
        delta: bonus,
        reason: "signup_bonus",
        idempotencyKey: `signup:${u.id}`,
        note: "Welcome bonus",
      });
    } catch (err) {
      console.error("[auth] signup bonus failed", { userId: u.id, err });
    }
  }
  // Fire-and-forget: signup must not wait on (or fail because of) the email provider.
  void import("@/server/email")
    .then(({ sendEmail }) => sendEmail("welcome", u.email, { name: u.name ?? "" }, { userId: u.id }))
    .catch((err: unknown) => console.error("[auth] welcome email failed", { userId: u.id, err }));
}
