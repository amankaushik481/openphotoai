/** Identity model CRUD: list (own + shared with me), create (plan limit), view, rename. */
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getPlan } from "@/config/plans";
import { db } from "@/db";
import { identityModels, modelShares } from "@/db/schema";
import type { IdentityModelRow, UserRow } from "@/db/types";
import { newTriggerWord } from "@/lib/ids";
import { errors } from "@/server/http";
import { isUniqueViolation } from "@/server/jobs/util";
import { SUBJECTS } from "@/types/domain";
import { getOwnedModel } from "./service";

export const MODEL_NAME_MAX = 60;
const modelName = z.string().trim().min(1, "Give your model a name.").max(MODEL_NAME_MAX);

export const createModelBody = z.object({ name: modelName, subject: z.enum(SUBJECTS).default("person") });
export const renameModelBody = z.object({ name: modelName });

/** Trigger words are random; a collision with the unique index is retried with a fresh one. */
const TRIGGER_WORD_ATTEMPTS = 3;

/** Models of other users shared with `userId` through an accepted, unexpired invite from the owner. */
async function sharedModels(userId: string): Promise<IdentityModelRow[]> {
  const rows = await db
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
        isNotNull(modelShares.modelId),
        isNull(identityModels.deletedAt),
        sql`${identityModels.userId} <> ${userId}`,
      ),
    )
    .orderBy(desc(identityModels.createdAt));
  const seen = new Set<string>();
  return rows.map((r) => r.model).filter((m) => !seen.has(m.id) && seen.add(m.id));
}

/** The user's own models (newest first) followed by models shared with them. */
export async function listModelsForUser(userId: string): Promise<IdentityModelRow[]> {
  const [own, shared] = await Promise.all([
    db
      .select()
      .from(identityModels)
      .where(and(eq(identityModels.userId, userId), isNull(identityModels.deletedAt)))
      .orderBy(desc(identityModels.createdAt)),
    sharedModels(userId),
  ]);
  return [...own, ...shared];
}

/** A model the user owns, or one shared with them (read-only). Throws not_found otherwise. */
export async function getViewableModel(userId: string, modelId: string): Promise<{ model: IdentityModelRow; shared: boolean }> {
  const [own] = await db
    .select()
    .from(identityModels)
    .where(and(eq(identityModels.id, modelId), eq(identityModels.userId, userId), isNull(identityModels.deletedAt)))
    .limit(1);
  if (own) return { model: own, shared: false };
  const shared = (await sharedModels(userId)).find((m) => m.id === modelId);
  if (!shared) throw errors.notFound("Model");
  return { model: shared, shared: true };
}

export async function createModel(user: UserRow, input: z.infer<typeof createModelBody>): Promise<IdentityModelRow> {
  const plan = getPlan(user.plan);
  const count = await db.$count(identityModels, and(eq(identityModels.userId, user.id), isNull(identityModels.deletedAt)));
  if (count >= plan.limits.maxModels) {
    const n = plan.limits.maxModels;
    const upgrade = user.plan === "studio" ? "" : " or upgrade your plan";
    throw errors.planLimit(
      `The ${plan.name} plan includes ${n} identity ${n === 1 ? "model" : "models"}. Delete one${upgrade} to create another.`,
    );
  }

  for (let attempt = 1; ; attempt++) {
    try {
      const [row] = await db
        .insert(identityModels)
        .values({
          userId: user.id,
          name: input.name,
          subject: input.subject,
          triggerWord: newTriggerWord(),
          status: "awaiting_consent",
          metadata: {},
        })
        .returning();
      return row!;
    } catch (err) {
      if (attempt < TRIGGER_WORD_ATTEMPTS && isUniqueViolation(err)) continue;
      throw err;
    }
  }
}

export async function renameModel(userId: string, modelId: string, name: string): Promise<IdentityModelRow> {
  const model = await getOwnedModel(userId, modelId);
  if (model.status === "deleting") throw errors.conflict("This model is being deleted.");
  const [row] = await db
    .update(identityModels)
    .set({ name })
    .where(and(eq(identityModels.id, model.id), eq(identityModels.userId, userId)))
    .returning();
  if (!row) throw errors.notFound("Model");
  return row;
}
