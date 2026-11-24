/** Idempotent seed steps: validate packs, ensure the admin user from SEED_ADMIN_EMAIL exists. */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { newId } from "@/lib/ids";

export type PackValidation =
  | { status: "ok"; packs: number; prompts: number }
  | { status: "skipped"; reason: string };

/** Load + validate every pack via the registry. Throws on invalid packs; skips while the registry is a stub. */
export async function validatePacks(): Promise<PackValidation> {
  try {
    const { listPacks } = await import("@/server/packs/registry");
    const packs = await listPacks();
    return { status: "ok", packs: packs.length, prompts: packs.reduce((sum, p) => sum + p.prompts.length, 0) };
  } catch (err) {
    if (err instanceof Error && /not implemented/i.test(err.message)) return { status: "skipped", reason: err.message };
    throw err;
  }
}

export interface SeedAdminResult {
  id: string;
  email: string;
  created: boolean;
}

/** Create the admin user, or promote an existing account with that email. Safe to run repeatedly. */
export async function seedAdminUser(rawEmail: string, name = "Admin"): Promise<SeedAdminResult> {
  const email = z.email().parse(rawEmail.trim().toLowerCase());
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  const [row] = await db
    .insert(user)
    .values({ id: newId("usr"), email, name, role: "admin", emailVerified: true })
    .onConflictDoUpdate({ target: user.email, set: { role: "admin", emailVerified: true } })
    .returning({ id: user.id, email: user.email });
  return { id: row!.id, email: row!.email, created: !existing };
}
