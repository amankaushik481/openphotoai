/**
 * Generate handler: identity model + (free prompt | pack prompt | draft re-render) [+ brand kit]
 * [+ style reference] -> images. Completion uses the engine's default ingestion, which reads
 * `plan.prompt`, `plan.seed` and `plan.isDraft`.
 */
import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { creditCost, INSTANT_MODE_MULTIPLIER } from "@/config/credits";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { getImageProvider } from "@/providers/registry";
import { errors } from "@/server/http";
import { getOwnedMedia, getOwnedUpload, providerInputUrl } from "@/server/media/service";
import { getOwnedModel, identityModeOf, identityRefFor, type IdentityMode } from "@/server/models/service";
import { expandPlaceholders, getPack, renderFreePrompt, renderPackPrompt } from "@/server/packs/registry";
import type { AspectRatio, Quality } from "@/types/domain";
import { assembledTexts } from "../assembled-text";
import { brandKitPrompt, getUsableBrandKit } from "../brand-kits";
import { defineHandler } from "./types";

/** How strongly a style reference image steers composition (0..1). */
export const REFERENCE_STRENGTH = 0.6;
const MAX_SEED = 2_147_483_647;

/** Persisted on jobs.output.plan (JSON). A type alias so it is assignable to Record<string, unknown>. */
export type GeneratePlanData = {
  /** Final prompt sent to the provider (contains the trigger word). */
  prompt: string;
  negativePrompt?: string;
  aspectRatio: AspectRatio;
  quality: Quality;
  numImages: number;
  seed: number;
  isDraft: boolean;
  identityMode: IdentityMode;
  referenceKey?: string;
  referenceMime?: string;
  packTitle?: string;
  packPromptIndex?: number;
  fromDraftMediaId?: string;
};

function readPlan(value: unknown): Partial<GeneratePlanData> {
  return value && typeof value === "object" ? (value as Partial<GeneratePlanData>) : {};
}

export default defineHandler({
  type: "generate",

  async plan({ user, input }) {
    const model = await getOwnedModel(user.id, input.modelId);
    if (model.status !== "ready") throw errors.conflict(`"${model.name}" isn't ready yet. Finish setting it up first.`);
    const identity = { triggerWord: model.triggerWord, subject: model.subject };
    const identityMode = identityModeOf(model);
    const textsToModerate: string[] = [];
    let assembled: string[] = [];
    let packId: string | null = null;
    let data: GeneratePlanData;

    if (input.fromDraftMediaId) {
      // Re-render a draft at full quality with the same prompt + seed (its text was moderated already).
      if (input.quality === "draft") throw errors.validation("Choose standard or high quality to re-render a draft.");
      const draft = await getOwnedMedia(user.id, input.fromDraftMediaId);
      if (!draft.isDraft || draft.kind !== "image") throw errors.validation("Only draft previews can be re-rendered.");
      if (draft.modelId && draft.modelId !== model.id) throw errors.validation("This draft was made with a different model.");
      const [source] = draft.jobId
        ? await db
            .select({ output: jobs.output })
            .from(jobs)
            .where(and(eq(jobs.id, draft.jobId), eq(jobs.userId, user.id)))
            .limit(1)
        : [];
      const prev = readPlan(source?.output?.plan);
      const prompt = prev.prompt ?? draft.prompt;
      if (!prompt) throw errors.validation("This draft can't be re-rendered.");
      packId = draft.packId;
      data = {
        prompt,
        negativePrompt: prev.negativePrompt,
        aspectRatio: prev.aspectRatio ?? input.aspectRatio,
        quality: input.quality,
        numImages: 1,
        seed: draft.seed ?? prev.seed ?? randomInt(MAX_SEED),
        isDraft: false,
        identityMode,
        referenceKey: prev.referenceKey,
        referenceMime: prev.referenceMime,
        packTitle: prev.packTitle,
        packPromptIndex: prev.packPromptIndex,
        fromDraftMediaId: draft.id,
      };
    } else {
      let prompt: string;
      let negativePrompt: string | undefined;
      let packTitle: string | undefined;
      let packPromptIndex: number | undefined;
      // Curated pack text stays out of the assembled check (only its tail is kept, see assembled-text.ts).
      let curated: string | null = null;
      const userParts: string[] = [];
      if (input.packId) {
        const pack = await getPack(input.packId);
        if (!pack) throw errors.notFound("Pack");
        packPromptIndex = input.packPromptIndex ?? randomInt(pack.prompts.length);
        const rendered = renderPackPrompt(pack, packPromptIndex, identity);
        ({ prompt, negativePrompt, title: packTitle } = rendered);
        curated = prompt;
        packId = pack.slug;
        if (input.prompt) {
          const extra = expandPlaceholders(input.prompt, identity);
          prompt = `${prompt}, ${extra}`;
          userParts.push(extra);
          textsToModerate.push(input.prompt);
        }
      } else {
        // The input schema guarantees a prompt when there is no pack / draft.
        const userPrompt = input.prompt ?? "";
        prompt = renderFreePrompt(userPrompt, identity);
        userParts.push(prompt);
        textsToModerate.push(userPrompt);
      }

      if (input.brandKitId) {
        const fragment = brandKitPrompt(await getUsableBrandKit(user.id, input.brandKitId));
        if (fragment) {
          prompt = `${prompt}, ${fragment}`;
          userParts.push(fragment);
        }
      }
      assembled = assembledTexts({ curated, parts: userParts, triggerWords: [model.triggerWord] });

      let referenceKey: string | undefined;
      let referenceMime: string | undefined;
      if (input.referenceUploadId) {
        const upload = await getOwnedUpload(user.id, input.referenceUploadId, "reference");
        referenceKey = upload.storageKey;
        referenceMime = upload.mimeType;
      }

      data = {
        prompt,
        negativePrompt,
        aspectRatio: input.aspectRatio,
        quality: input.quality,
        numImages: input.numImages,
        seed: input.seed ?? randomInt(MAX_SEED),
        isDraft: input.quality === "draft",
        identityMode,
        referenceKey,
        referenceMime,
        packTitle,
        packPromptIndex,
      };
    }

    return {
      modelId: model.id,
      packId,
      sourceMediaId: input.fromDraftMediaId ?? null,
      textsToModerate,
      assembledTexts: assembled,
      data,
      // Instant (reference-based) models run on a pricier multi-reference model; drafts stay free.
      credits: identityMode === "instant" ? creditCost(input) * INSTANT_MODE_MULTIPLIER : undefined,
    };
  },

  async submit({ user, plan, submitOpts }) {
    const data = plan.data as GeneratePlanData;
    const model = await getOwnedModel(user.id, plan.modelId!);
    const identity = await identityRefFor(model);
    const referenceImageUrl = data.referenceKey ? await providerInputUrl(data.referenceKey, data.referenceMime) : undefined;
    return getImageProvider().submitGenerate(
      {
        prompt: data.prompt,
        negativePrompt: data.negativePrompt,
        identity,
        aspectRatio: data.aspectRatio,
        numImages: data.numImages,
        quality: data.quality,
        seed: data.seed,
        ...(referenceImageUrl ? { referenceImageUrl, referenceStrength: REFERENCE_STRENGTH } : {}),
      },
      submitOpts,
    );
  },
});
