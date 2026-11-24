/** Multi-person consent: every identity must be owned by the user or shared via an accepted invite. */
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { identityModels, modelShares, user } from "@/db/schema";
import type { IdentityModelRow } from "@/db/types";
import { errors } from "@/server/http";
import { recordBlock } from "./events";
import { MULTI_PERSON_CONSENT_MESSAGE } from "./policy";

/**
 * Resolve identity models a user may use. Each model must be status "ready" and either owned
 * by the user or shared with them through an accepted, unexpired model_shares invite granted by
 * the model's owner (who must not be suspended). Unknown, deleted or unshared models throw AppError("forbidden") after
 * recording "multi_person_unauthorized"; authorized models that aren't ready throw "conflict".
 * Returns the models in request order (duplicates removed).
 */
export async function assertModelsUsable(userId: string, modelIds: string[]): Promise<IdentityModelRow[]> {
  const ids = [...new Set(modelIds)];
  if (ids.length === 0) return [];

  const rows = await db
    .select()
    .from(identityModels)
    .where(and(inArray(identityModels.id, ids), isNull(identityModels.deletedAt)));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const foreignIds = rows.filter((r) => r.userId !== userId).map((r) => r.id);
  // A suspended owner's models stop working through shares too (reversible: nothing is revoked).
  const bannedOwners = new Set(
    foreignIds.length
      ? (
          await db
            .select({ id: user.id })
            .from(user)
            .where(and(inArray(user.id, [...new Set(rows.filter((r) => r.userId !== userId).map((r) => r.userId))]), eq(user.banned, true)))
        ).map((u) => u.id)
      : [],
  );
  const shares = foreignIds.length
    ? await db
        .select({ modelId: modelShares.modelId, ownerUserId: modelShares.ownerUserId })
        .from(modelShares)
        .where(
          and(
            eq(modelShares.requesterUserId, userId),
            inArray(modelShares.modelId, foreignIds),
            eq(modelShares.status, "accepted"),
            gt(modelShares.expiresAt, new Date()),
          ),
        )
    : [];
  // The share must have been granted by the model's current owner.
  const shared = new Set(
    shares.filter((s) => s.modelId && s.ownerUserId && byId.get(s.modelId)?.userId === s.ownerUserId).map((s) => s.modelId),
  );

  const unauthorized = ids.filter((id) => {
    const row = byId.get(id);
    return !row || (row.userId !== userId && (!shared.has(id) || bannedOwners.has(row.userId)));
  });
  if (unauthorized.length > 0) {
    await recordBlock("multi_person_unauthorized", { userId }, { requestedModelIds: ids, unauthorizedModelIds: unauthorized });
    throw errors.forbidden(MULTI_PERSON_CONSENT_MESSAGE);
  }

  const models = ids.map((id) => byId.get(id)!);
  const notReady = models.filter((m) => m.status !== "ready");
  if (notReady.length > 0) {
    throw errors.conflict(
      notReady.length === 1 ? `The model "${notReady[0].name}" isn't ready yet.` : "Some of these models aren't ready yet.",
    );
  }
  return models;
}
