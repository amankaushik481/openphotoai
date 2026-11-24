/**
 * Identity models visible to a user through the public API: their own (not deleted) plus models
 * shared with them through an accepted, unexpired multi-person invite granted by the model's
 * current owner (same rule as `assertModelsUsable` in src/server/safety/multi-person.ts).
 */
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { identityModels, modelShares } from "@/db/schema";
import type { IdentityModelRow } from "@/db/types";
import { errors } from "@/server/http";

function sharedModelsQuery(userId: string, modelId?: string) {
  return db
    .select({ model: identityModels })
    .from(modelShares)
    .innerJoin(
      identityModels,
      and(eq(identityModels.id, modelShares.modelId), eq(identityModels.userId, modelShares.ownerUserId)),
    )
    .where(
      and(
        eq(modelShares.requesterUserId, userId),
        eq(modelShares.status, "accepted"),
        gt(modelShares.expiresAt, new Date()),
        isNull(identityModels.deletedAt),
        ne(identityModels.userId, userId),
        modelId ? eq(identityModels.id, modelId) : undefined,
      ),
    )
    .orderBy(desc(identityModels.createdAt));
}

/** Own models (newest first), then shared ones. */
export async function listVisibleModels(userId: string): Promise<IdentityModelRow[]> {
  const [own, shared] = await Promise.all([
    db
      .select()
      .from(identityModels)
      .where(and(eq(identityModels.userId, userId), isNull(identityModels.deletedAt)))
      .orderBy(desc(identityModels.createdAt)),
    sharedModelsQuery(userId),
  ]);
  const seen = new Set(own.map((m) => m.id));
  const extra: IdentityModelRow[] = [];
  for (const { model } of shared) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    extra.push(model);
  }
  return [...own, ...extra];
}

/** An own or shared model. Throws AppError not_found otherwise (no existence leak). */
export async function getVisibleModel(userId: string, modelId: string): Promise<IdentityModelRow> {
  const [own] = await db
    .select()
    .from(identityModels)
    .where(and(eq(identityModels.id, modelId), eq(identityModels.userId, userId), isNull(identityModels.deletedAt)))
    .limit(1);
  if (own) return own;
  const [shared] = await sharedModelsQuery(userId, modelId).limit(1);
  if (!shared) throw errors.notFound("Model");
  return shared.model;
}
