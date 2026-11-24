/**
 * Together photos: two identity models in one scene. Each model must be the user's own or shared
 * with them through an accepted multi-person invite (`assertModelsUsable`, which records
 * "multi_person_unauthorized" and throws forbidden otherwise), and at least one must be the
 * user's own: nobody composes two other people together.
 *
 * The prompt is free text or a pack prompt rendered for two subjects (both trigger words);
 * identities go to the provider with reference photos (`submitEdit` mode "multi_person").
 *
 * Likeness scoring is skipped (`scoreLikeness: false`): the scorer compares the most prominent
 * face with ONE identity, and in a two-person scene that face may be either person, so scores
 * (and the likeness-guarantee refund) would be arbitrary. The best-shots picker uses quality only.
 * Credits: CREDIT_COSTS.multiPerson per image (default creditCost).
 */
import { randomInt } from "node:crypto";
import { getImageProvider } from "@/providers/registry";
import { errors } from "@/server/http";
import { identityRefFor } from "@/server/models/service";
import { getPack } from "@/server/packs/registry";
import { assertModelsUsable, recordModerationEvent } from "@/server/safety";
import { REFERENCE_PHOTOS_PER_PERSON } from "@/server/together/constants";
import { assertReferencePhotos } from "@/server/together/models";
import {
  expandTwoPersonPlaceholders,
  renderTwoPersonPackPrompt,
  renderTwoPersonPrompt,
  type TwoPeople,
} from "@/server/together/prompts";
import type { AspectRatio } from "@/types/domain";
import { assembledTexts as assembleTexts } from "../assembled-text";
import { defineHandler } from "./types";

const MAX_SEED = 2_147_483_647;

/** Persisted on jobs.output.plan (JSON). */
export type MultiPersonPlanData = {
  /** Final prompt (contains both trigger words). */
  prompt: string;
  /** Request order: the first is {subject}, the second {subject2}. */
  modelIds: string[];
  /** Models used through a share (audit trail). */
  sharedModelIds: string[];
  aspectRatio: AspectRatio;
  numImages: number;
  seed: number;
  isDraft: false;
  scoreLikeness: false;
  packTitle?: string;
  packPromptIndex?: number;
};

export default defineHandler({
  type: "multi_person",

  async plan({ user, input }) {
    const models = await assertModelsUsable(user.id, input.modelIds);
    if (models.length !== 2) throw errors.validation("Pick two different models.");
    const own = models.find((m) => m.userId === user.id);
    if (!own) {
      const details = { reason: "no_own_model", requestedModelIds: input.modelIds };
      await recordModerationEvent("multi_person_unauthorized", { userId: user.id }, details);
      throw errors.forbidden("Together photos must include one of your own models.");
    }
    await assertReferencePhotos(models);

    const people: TwoPeople = [models[0]!, models[1]!];
    const textsToModerate: string[] = [];
    const userParts: string[] = [];
    let curated: string | null = null;
    let prompt: string;
    let packId: string | null = null;
    let packTitle: string | undefined;
    let packPromptIndex: number | undefined;

    if (input.packId) {
      const pack = await getPack(input.packId);
      if (!pack) throw errors.notFound("Pack");
      const rendered = renderTwoPersonPackPrompt(pack, randomInt(pack.prompts.length), people);
      ({ prompt, title: packTitle, index: packPromptIndex } = rendered);
      curated = prompt;
      packId = pack.slug;
      if (input.prompt) {
        const extra = expandTwoPersonPlaceholders(input.prompt, people);
        if (extra) {
          prompt = `${prompt}, ${extra}`;
          userParts.push(extra);
        }
        textsToModerate.push(input.prompt);
      }
    } else {
      // The input schema guarantees a prompt when there is no pack.
      const userPrompt = input.prompt ?? "";
      prompt = renderTwoPersonPrompt(userPrompt, people);
      userParts.push(prompt);
      textsToModerate.push(userPrompt);
    }

    const data: MultiPersonPlanData = {
      prompt,
      modelIds: models.map((m) => m.id),
      sharedModelIds: models.filter((m) => m.userId !== user.id).map((m) => m.id),
      aspectRatio: input.aspectRatio,
      numImages: input.numImages,
      seed: randomInt(MAX_SEED),
      isDraft: false,
      scoreLikeness: false,
      packTitle,
      packPromptIndex,
    };
    // The job (and its media) belongs to the requester's own model; the partner's stays theirs.
    const assembledTexts = assembleTexts({ curated, parts: userParts, triggerWords: models.map((m) => m.triggerWord) });
    return { modelId: own.id, packId, textsToModerate, assembledTexts, data };
  },

  async submit({ user, plan, submitOpts }) {
    const data = plan.data as MultiPersonPlanData;
    // Re-check right before the provider call: a share revoked since planning must not be used.
    const models = await assertModelsUsable(user.id, data.modelIds);
    const identities = await Promise.all(
      models.map((m) => identityRefFor(m, { referencePhotos: REFERENCE_PHOTOS_PER_PERSON })),
    );
    return getImageProvider().submitEdit(
      {
        mode: "multi_person",
        prompt: data.prompt,
        imageUrls: [],
        identities,
        aspectRatio: data.aspectRatio,
        numImages: data.numImages,
        seed: data.seed,
      },
      submitOpts,
    );
  },
});
