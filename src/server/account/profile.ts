/** Read-only account facts for the settings page. */
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";

export interface SignInMethodDTO {
  /** "email" (magic link, always available) or a Better Auth OAuth provider id such as "google". */
  providerId: string;
  /** ISO date the method was linked (null for email sign-in, which needs no linking). */
  linkedAt: string | null;
}

export async function listSignInMethods(userId: string): Promise<SignInMethodDTO[]> {
  const rows = await db
    .select({ providerId: account.providerId, createdAt: account.createdAt })
    .from(account)
    .where(eq(account.userId, userId))
    .orderBy(asc(account.createdAt));
  const oauth = rows
    .filter((r) => r.providerId !== "email" && r.providerId !== "credential")
    .map((r) => ({ providerId: r.providerId, linkedAt: r.createdAt.toISOString() }));
  return [{ providerId: "email", linkedAt: null }, ...oauth];
}
