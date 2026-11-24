/** Server-side data for the generation pages (create, pack detail). */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { IdentityMode } from "@/components/create/logic";
import { draftDailyLimit } from "@/components/create/logic";
import { db } from "@/db";
import { identityModels } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { identityModeOf } from "@/server/models/service";
import { checkRateLimit } from "@/server/rate-limit";

/** Identity mode per owned model (IdentityModelDTO doesn't carry it; instant models cost 2×). */
export async function loadModelModes(userId: string): Promise<Record<string, IdentityMode>> {
  const rows = await db
    .select({ id: identityModels.id, metadata: identityModels.metadata })
    .from(identityModels)
    .where(and(eq(identityModels.userId, userId), isNull(identityModels.deletedAt)));
  return Object.fromEntries(rows.map((r) => [r.id, identityModeOf(r)]));
}

export interface DraftAllowance {
  limit: number;
  remaining: number;
  resetAt: string;
}

/** Free drafts left today. A zero-cost check reads the counter without consuming a draft. */
export async function loadDraftAllowance(user: Pick<UserRow, "id" | "hasPaid">): Promise<DraftAllowance> {
  const name = user.hasPaid ? "draftsPerDay" : "draftsPerDayFree";
  try {
    const r = await checkRateLimit(name, `user:${user.id}`, 0);
    return { limit: r.limit, remaining: r.remaining, resetAt: r.resetAt.toISOString() };
  } catch (err) {
    // The counter is informational here; the engine enforces the real limit on submit.
    console.warn("[create] draft allowance lookup failed:", err instanceof Error ? err.message : err);
    const limit = draftDailyLimit(user.hasPaid);
    return { limit, remaining: limit, resetAt: new Date(Date.now() + 86_400_000).toISOString() };
  }
}
