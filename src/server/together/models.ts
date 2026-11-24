/** Models available for together photos: the user's own + models shared with them. */
import { and, count, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { identityModels, modelShares, trainingPhotos } from "@/db/schema";
import type { IdentityModelRow } from "@/db/types";
import { errors } from "@/server/http";
import { toModelDTO } from "@/server/models/service";
import type { IdentityModelDTO } from "@/types/domain";
import type { PartnerModelDTO } from "./types";

export async function listOwnModels(userId: string): Promise<IdentityModelDTO[]> {
  const rows = await db
    .select()
    .from(identityModels)
    .where(and(eq(identityModels.userId, userId), isNull(identityModels.deletedAt)))
    .orderBy(desc(identityModels.createdAt));
  return Promise.all(rows.map((m) => toModelDTO(m, userId)));
}

/**
 * Models shared with `userId` through accepted, unexpired invites granted by the model's current
 * owner (the same rule `assertModelsUsable` enforces), most recently shared first.
 */
export async function listPartnerModels(userId: string, now: Date = new Date()): Promise<PartnerModelDTO[]> {
  const rows = await db
    .select({ model: identityModels, shareId: modelShares.id })
    .from(modelShares)
    .innerJoin(
      identityModels,
      and(eq(identityModels.id, modelShares.modelId), eq(identityModels.userId, modelShares.ownerUserId)),
    )
    .where(
      and(
        eq(modelShares.requesterUserId, userId),
        eq(modelShares.status, "accepted"),
        gt(modelShares.expiresAt, now),
        isNull(identityModels.deletedAt),
      ),
    )
    .orderBy(desc(modelShares.respondedAt));

  // One entry per model (the same model can be shared through several accepted invites).
  const byModel = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (r.model.userId !== userId && !byModel.has(r.model.id)) byModel.set(r.model.id, r);
  return Promise.all(
    [...byModel.values()].map(async (r) => ({ ...(await toModelDTO(r.model, userId)), shareId: r.shareId })),
  );
}

/**
 * Together photos are composed from each person's reference photos (accepted training photos),
 * so every model needs at least one. Checked before charging.
 */
export async function assertReferencePhotos(models: readonly IdentityModelRow[]): Promise<void> {
  if (models.length === 0) return;
  const rows = await db
    .select({ modelId: trainingPhotos.modelId, n: count() })
    .from(trainingPhotos)
    .innerJoin(
      identityModels,
      and(eq(identityModels.id, trainingPhotos.modelId), eq(identityModels.userId, trainingPhotos.userId)),
    )
    .where(
      and(
        inArray(
          trainingPhotos.modelId,
          models.map((m) => m.id),
        ),
        eq(trainingPhotos.status, "accepted"),
      ),
    )
    .groupBy(trainingPhotos.modelId);
  const counts = new Map(rows.map((r) => [r.modelId, Number(r.n)]));
  const missing = models.find((m) => !counts.get(m.id));
  if (missing) {
    throw errors.conflict(`"${missing.name}" has no reference photos left, so it can't be used in together photos.`);
  }
}
