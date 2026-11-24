/**
 * Instruction edit handler: change the outfit / background / hair / expression of (or anything in) a photo
 * OpenShoot generated for this user, keeping the person's identity (DECISIONS.md #11: edits only operate on the
 * user's own generated media). Completion uses the engine's default ingestion: `plan.prompt` becomes the media
 * prompt and outputs get `parentMediaId = job.sourceMediaId` (the edited photo).
 *
 * Photos of several people (together photos, and photos derived from them) have no single identity: they are edited
 * without identity references and without likeness scoring (which would compare a random face).
 *
 * `loadImageSource`, `editSourceContext`, `sourceIdentity` and `cleanInstruction` are shared with inpaint.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, media } from "@/db/schema";
import type { IdentityModelRow, JobRow, MediaRow } from "@/db/types";
import type { IdentityRef } from "@/providers/types";
import { getImageProvider } from "@/providers/registry";
import { AppError, errors } from "@/server/http";
import { getOwnedMedia, providerInputUrl } from "@/server/media/service";
import { getOwnedModel, identityModeOf, identityRefFor } from "@/server/models/service";
import { assertModelsUsable } from "@/server/safety";
import type { EDIT_KINDS } from "@/types/domain";
import { assembledTexts } from "../assembled-text";
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
  /** Send the source model's identity to the provider (false for group photos / no usable model). */
  useIdentity: boolean;
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

/** How many parent photos to walk back when looking for a together photo (edit chains are short). */
const MAX_LINEAGE_DEPTH = 8;

/**
 * The partner models of the together (multi_person) photo this photo descends from, or null when it
 * doesn't descend from one: walks `parentMediaId` back through derived jobs (edits, upscales,
 * try-ons...) until an origin job (generate / pose copy / together).
 */
async function groupPhotoSharedModels(userId: string, source: MediaRow): Promise<string[] | null> {
  let mediaId: string | null = source.id;
  for (let depth = 0; mediaId && depth < MAX_LINEAGE_DEPTH; depth++) {
    const [row]: { parentMediaId: string | null; jobType: string | null; output: JobRow["output"] | null }[] = await db
      .select({ parentMediaId: media.parentMediaId, jobType: jobs.type, output: jobs.output })
      .from(media)
      .leftJoin(jobs, and(eq(jobs.id, media.jobId), eq(jobs.userId, userId)))
      .where(and(eq(media.id, mediaId), eq(media.userId, userId)))
      .limit(1);
    if (!row) return null;
    if (row.jobType === "multi_person") {
      const shared = (row.output?.plan as { sharedModelIds?: unknown } | undefined)?.sharedModelIds;
      return Array.isArray(shared) ? shared.filter((id): id is string => typeof id === "string") : [];
    }
    if (row.jobType === "generate" || row.jobType === "pose_copy") return null;
    mediaId = row.parentMediaId;
  }
  return null;
}

/**
 * A together photo shows someone else, who consented through a model share: editing it (or dressing
 * it in a garment) is only allowed while that share is still accepted and unexpired and the partner's
 * model still exists (SAF-12). Throws AppError("forbidden") otherwise. Returns whether it's a group photo.
 */
export async function assertGroupConsentActive(userId: string, source: MediaRow): Promise<boolean> {
  const shared = await groupPhotoSharedModels(userId, source);
  if (shared === null) return false;
  if (shared.length > 0) await assertModelsUsable(userId, shared);
  return true;
}

export interface EditSourceContext {
  /** The user's usable model the photo was made with (outputs keep it as their modelId). */
  model: IdentityModelRow | null;
  /** Several people: no identity references, no likeness scoring. */
  group: boolean;
  /** How the template refers to the subject(s). */
  who: string;
}

export async function editSourceContext(userId: string, source: MediaRow): Promise<EditSourceContext> {
  const [model, group] = await Promise.all([usableSourceModel(userId, source.modelId), assertGroupConsentActive(userId, source)]);
  const who = group ? "the people in the photo" : model ? `the ${model.subject}` : "the person";
  return { model, group, who };
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
 * `who` is how the subject is referred to, e.g. "the woman" (default "the person").
 */
export function editPrompt(kind: EditKind, instruction: string, who = "the person"): string {
  const what = cleanInstruction(instruction, who);
  switch (kind) {
    case "outfit":
      return (
        `Change only the clothing of ${who} to: ${what}. ` +
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
        `Keep the face and identity of ${who}, and everything this instruction doesn't mention, exactly as it is.`
      );
  }
}

/* ───────────── handler ───────────── */

export default defineHandler({
  type: "edit",

  async plan({ user, input }) {
    if (!cleanInstruction(input.instruction, "")) throw errors.validation("Describe the change you want.");
    const source = await loadImageSource(user.id, input.sourceMediaId);
    const { model, group, who } = await editSourceContext(user.id, source);
    const data: EditPlanData = {
      prompt: editPrompt(input.edit, input.instruction, who),
      edit: input.edit,
      numImages: input.numImages,
      sourceKey: source.storageKey,
      sourceMime: source.mimeType,
      parentMediaId: source.id,
      useIdentity: Boolean(model) && !group,
      scoreLikeness: !group,
    };
    return {
      // The job's model drives likeness scoring (+ the likeness guarantee) and the outputs' modelId.
      modelId: model?.id ?? null,
      sourceMediaId: source.id,
      textsToModerate: [input.instruction],
      // The instruction inside its template ("Change only the clothing of the woman to: nothing").
      assembledTexts: assembledTexts({ parts: [data.prompt], triggerWords: [model?.triggerWord] }),
      data,
    };
  },

  async submit({ user, plan, submitOpts }) {
    const data = plan.data as EditPlanData;
    const [identity, sourceUrl] = await Promise.all([
      data.useIdentity ? sourceIdentity(user.id, plan.modelId, EDIT_IDENTITY_REFS) : undefined,
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
