/**
 * Virtual try-on handler: one of your OpenShoot photos (person) + an uploaded garment photo -> the
 * same photo wearing the garment.
 *
 * - The person must be an image OpenShoot generated for this user (DECISIONS #11): try-on never runs
 *   on arbitrary uploaded photos of people. The garment is an upload with purpose "garment" (already
 *   safety-checked by POST /api/uploads).
 * - Completion uses the engine's default ingestion: the job's `sourceMediaId` (the person photo)
 *   becomes each output's `parentMediaId`, and the job's `modelId` (the person photo's identity
 *   model) enables likeness scoring + the likeness guarantee.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { identityModels, jobs } from "@/db/schema";
import type { MediaRow } from "@/db/types";
import { getImageProvider } from "@/providers/registry";
import { errors } from "@/server/http";
import { getOwnedMedia, getOwnedUpload, providerInputUrl } from "@/server/media/service";
import type { TRY_ON_CATEGORIES } from "@/types/domain";
import { assertGroupConsentActive } from "./edit";
import { defineHandler } from "./types";

export type TryOnCategory = (typeof TRY_ON_CATEGORIES)[number];

/** Persisted on jobs.output.plan (JSON). A type alias so it is assignable to Record<string, unknown>. */
export type TryOnPlanData = {
  personKey: string;
  personMime: string;
  garmentKey: string;
  garmentMime: string;
  category: TryOnCategory;
  /** Read by the engine's default ingestion (likeness guarantee). */
  scoreLikeness: boolean;
};

/**
 * Identity model to score the output's likeness against: the person photo's model, but only while
 * it still belongs to this user. Photos from together (multi-person) jobs show two people, so their
 * "main face" can't be compared reliably and likeness scoring is skipped.
 */
async function likenessTarget(userId: string, person: MediaRow): Promise<{ modelId: string | null; scoreLikeness: boolean }> {
  if (!person.modelId) return { modelId: null, scoreLikeness: false };
  const [[model], [sourceJob]] = await Promise.all([
    db
      .select({ id: identityModels.id })
      .from(identityModels)
      .where(and(eq(identityModels.id, person.modelId), eq(identityModels.userId, userId), isNull(identityModels.deletedAt)))
      .limit(1),
    person.jobId
      ? db
          .select({ type: jobs.type })
          .from(jobs)
          .where(and(eq(jobs.id, person.jobId), eq(jobs.userId, userId)))
          .limit(1)
      : Promise.resolve([]),
  ]);
  if (!model) return { modelId: null, scoreLikeness: false };
  return { modelId: model.id, scoreLikeness: sourceJob?.type !== "multi_person" };
}

export default defineHandler({
  type: "try_on",

  async plan({ user, input }) {
    const person = await getOwnedMedia(user.id, input.personMediaId);
    if (person.kind !== "image") throw errors.validation("Pick a photo, not a video, to try the garment on.");

    const garment = await getOwnedUpload(user.id, input.garmentUploadId);
    if (garment.purpose !== "garment") {
      throw errors.validation("That image wasn't uploaded as a garment. Upload the garment photo again.");
    }
    // Defense in depth: POST /api/uploads never stores a blocked garment.
    if (garment.moderation && !garment.moderation.allowed) {
      throw errors.contentBlocked("This garment photo was blocked by our safety rules.");
    }

    // A together photo shows a partner who consented through a share: only while it is still active.
    await assertGroupConsentActive(user.id, person);
    const { modelId, scoreLikeness } = await likenessTarget(user.id, person);
    const data: TryOnPlanData = {
      personKey: person.storageKey,
      personMime: person.mimeType,
      garmentKey: garment.storageKey,
      garmentMime: garment.mimeType,
      category: input.category,
      scoreLikeness,
    };
    return { modelId, packId: null, sourceMediaId: person.id, textsToModerate: [], data };
  },

  async submit({ plan, submitOpts }) {
    const data = plan.data as TryOnPlanData;
    const [personImageUrl, garmentImageUrl] = await Promise.all([
      providerInputUrl(data.personKey, data.personMime),
      providerInputUrl(data.garmentKey, data.garmentMime),
    ]);
    return getImageProvider().submitTryOn({ personImageUrl, garmentImageUrl, category: data.category }, submitOpts);
  },
});
