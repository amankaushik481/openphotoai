/**
 * Instruction edit handler: change the outfit / background / hair / expression of (or anything in) a photo
 * OpenShoot generated for this user, keeping the person's identity (DECISIONS.md #11: edits only operate on the
 * user's own generated media). Completion uses the engine's default ingestion: `plan.prompt` becomes the media
 * prompt and outputs get `parentMediaId = job.sourceMediaId` (the edited photo).
 *
 * `loadImageSource`, `usableSourceModel` and `sourceIdentity` are shared with the inpaint handler.
 */
import type { IdentityModelRow, MediaRow } from "@/db/types";
import type { IdentityRef } from "@/providers/types";
import { getImageProvider } from "@/providers/registry";
import { AppError, errors } from "@/server/http";
import { getOwnedMedia, providerInputUrl } from "@/server/media/service";
import { getOwnedModel, identityModeOf, identityRefFor } from "@/server/models/service";
import type { EDIT_KINDS, Subject } from "@/types/domain";
import { defineHandler } from "./types";

export type EditKind = (typeof EDIT_KINDS)[number];

/** Identity reference photos sent with an instruction edit (only to keep the face accurate). */
export const EDIT_IDENTITY_REFS = 2;

/** Persisted on jobs.output.plan (JSON). */
export type EditPlanData = {
  /** Instruction sent to the provider (also stored as the media prompt). */
  prompt: string;
  edit: EditKind;
  numImages: number;
  sourceKey: string;
  sourceMime: string;
  parentMediaId: string;
  scoreLikeness: boolean;
};

/* ───────────── shared with inpaint ───────────── */

/** The user's own (non-deleted) generated photo. Another user's media is `not_found`; videos are rejected. */
export async function loadImageSource(userId: string, mediaId: string): Promise<MediaRow> {
  const source = await getOwnedMedia(userId, mediaId);
  if (source.kind !== "image") throw errors.validation("Only photos can be edited. Pick a photo instead of a video.");
  return source;
}

function hasUsableIdentity(model: IdentityModelRow): boolean {
  if (model.status !== "ready") return false;
  return identityModeOf(model) === "instant" || Boolean(model.providerModelRef);
}

/**
 * The identity model a source photo was made with, when the user still owns it and it is usable.
 * A deleted / unfinished model (or one shared by someone else) means the edit proceeds without identity.
 */
export async function usableSourceModel(userId: string, modelId: string | null): Promise<IdentityModelRow | null> {
  if (!modelId) return null;
  try {
    const model = await getOwnedModel(userId, modelId);
    return hasUsableIdentity(model) ? model : null;
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") return null;
    throw err;
  }
}

/**
 * Identity reference for submit(). If the model became unusable since plan() (deleted, retraining), the edit
 * still runs without it instead of failing.
 */
export async function sourceIdentity(
  userId: string,
  modelId: string | null | undefined,
  referencePhotos: number,
): Promise<IdentityRef | undefined> {
  const model = await usableSourceModel(userId, modelId ?? null);
  if (!model) return undefined;
  try {
    return await identityRefFor(model, { referencePhotos });
  } catch (err) {
    if (err instanceof AppError && (err.code === "conflict" || err.code === "not_found")) return undefined;
    throw err;
  }
}

/* ───────────── prompt templates ───────────── */

/** Trim, collapse whitespace and drop trailing sentence punctuation so the instruction slots into a template. */
export function cleanInstruction(instruction: string, who: string): string {
  return instruction
    .replaceAll("{subject}", who)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!;,\s]+$/, "");
}

/**
 * Provider instruction for an edit kind. Each template names the one thing that changes and pins everything
 * else (identity first), so a "navy suit" edit can't drift the face, pose or background.
 */
export function editPrompt(kind: EditKind, instruction: string, subject?: Subject): string {
  const who = subject ? `the ${subject}` : "the person";
  const what = cleanInstruction(instruction, who);
  switch (kind) {
    case "outfit":
      return (
        `Change only the clothing ${who} is wearing to: ${what}. ` +
        "Keep the same face and identity, hairstyle, expression, body shape, pose, framing and background exactly as they are."
      );
    case "background":
      return (
        `Replace only the background with: ${what}. ` +
        `Keep ${who} exactly as they are (face and identity, hair, expression, clothing, pose and framing) ` +
        "and match the lighting on them to the new background."
      );
    case "hair":
      return (
        `Change only the hairstyle of ${who} to: ${what}. ` +
        "Keep the same face and identity, expression, clothing, pose, framing and background exactly as they are."
      );
    case "expression":
      return (
        `Change only the facial expression of ${who} to: ${what}. ` +
        "Keep the same identity and facial features, hair, clothing, pose, framing and background exactly as they are."
      );
    case "custom":
      return (
        `${what.charAt(0).toUpperCase()}${what.slice(1)}. ` +
        `Keep ${who}'s face and identity, and everything this instruction doesn't mention, exactly as it is.`
      );
  }
}

/* ───────────── handler ───────────── */

export default defineHandler({
  type: "edit",

  async plan({ user, input }) {
    if (!cleanInstruction(input.instruction, "")) throw errors.validation("Describe the change you want.");
    const source = await loadImageSource(user.id, input.sourceMediaId);
    const model = await usableSourceModel(user.id, source.modelId);
    const data: EditPlanData = {
      prompt: editPrompt(input.edit, input.instruction, model?.subject),
      edit: input.edit,
      numImages: input.numImages,
      sourceKey: source.storageKey,
      sourceMime: source.mimeType,
      parentMediaId: source.id,
      scoreLikeness: true,
    };
    return {
      // The job's model drives likeness scoring (+ the likeness guarantee) and the outputs' modelId.
      modelId: model?.id ?? null,
      sourceMediaId: source.id,
      textsToModerate: [input.instruction],
      data,
    };
  },

  async submit({ user, plan, submitOpts }) {
    const data = plan.data as EditPlanData;
    const [identity, sourceUrl] = await Promise.all([
      sourceIdentity(user.id, plan.modelId, EDIT_IDENTITY_REFS),
      providerInputUrl(data.sourceKey, data.sourceMime),
    ]);
    return getImageProvider().submitEdit(
      {
        mode: "instruct",
        prompt: data.prompt,
        imageUrls: [sourceUrl],
        ...(identity ? { identity } : {}),
        numImages: data.numImages,
      },
      submitOpts,
    );
  },
});
