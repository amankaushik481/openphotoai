/**
 * Hand-written JSON Schemas for the API response DTOs (src/types/domain.ts, src/types/pack.ts).
 *
 * `dto<T>()` takes one schema per key of the DTO type, so adding/removing a DTO field without
 * updating this file is a type error; tests/unit/api-v1 also compares real DTOs against these.
 */
import {
  API_ERROR_CODES,
  CREDIT_REASONS,
  JOB_STATUSES,
  JOB_TYPES,
  MODEL_STATUSES,
  PHOTO_STATUSES,
  SUBJECTS,
  type BatchDTO,
  type CreditLedgerEntryDTO,
  type IdentityModelDTO,
  type JobDTO,
  type MediaDTO,
  type MediaScores,
  type PhotoIssue,
  type PhotoIssueCode,
  type PhotoQualityReport,
  type ReadinessDTO,
  type TrainingPhotoDTO,
} from "@/types/domain";
import { PACK_CATEGORIES, type PackSummary } from "@/types/pack";
import type { JsonSchema } from "./types";

export const ref = (name: string): JsonSchema => ({ $ref: `#/components/schemas/${name}` });

const str = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: "string", description, ...extra });
const int = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: "integer", description, ...extra });
const bool = (description: string): JsonSchema => ({ type: "boolean", description });
const dateTime = (description: string): JsonSchema => ({ type: "string", format: "date-time", description });
const enumOf = (values: readonly string[], description: string): JsonSchema => ({
  type: "string",
  enum: [...values],
  description,
});

/** `T | null` in JSON Schema 2020-12 (OpenAPI 3.1 has no `nullable`). */
export function nullable(schema: JsonSchema): JsonSchema {
  if (schema.$ref) return { anyOf: [schema, { type: "null" }] };
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  return { ...schema, type: [...types, "null"] };
}

/** Object schema whose properties must cover every key of `T` (compile-time sync with the DTO type). */
export function dto<T>(
  description: string,
  properties: { [K in keyof T]-?: JsonSchema },
  optional: readonly (keyof T & string)[] = [],
): JsonSchema {
  const props = properties as Record<string, JsonSchema>;
  return {
    type: "object",
    description,
    properties: props,
    required: Object.keys(props).filter((k) => !optional.includes(k as keyof T & string)),
  };
}

const id = (prefix: string, what: string) => str(`${what} id.`, { examples: [`${prefix}_k3j9x2m4q8w1p7r5t6y0`] });

export const MediaScoresSchema = dto<MediaScores>(
  "Best-shots scores, each 0..1.",
  {
    likeness: { type: "number", minimum: 0, maximum: 1, description: "Face similarity to your identity model." },
    quality: { type: "number", minimum: 0, maximum: 1, description: "Technical/aesthetic quality." },
    overall: { type: "number", minimum: 0, maximum: 1, description: "Combined score used to rank results." },
  },
  ["likeness", "quality"],
);

export const MediaSchema = dto<MediaDTO>(
  "A generated photo or video. URLs are signed and expire; re-fetch the media to refresh them.",
  {
    id: id("med", "Media"),
    kind: enumOf(["image", "video"], "Media kind."),
    url: str("Signed URL of the full-size file (expires).", { format: "uri" }),
    thumbUrl: str("Signed URL of a thumbnail (the full file when no thumbnail exists).", { format: "uri" }),
    downloadUrl: str("Signed URL that downloads the file as an attachment (no auth header needed).", { format: "uri" }),
    mimeType: str("MIME type, e.g. image/jpeg or video/mp4."),
    width: nullable(int("Width in pixels.")),
    height: nullable(int("Height in pixels.")),
    durationSec: nullable({ type: "number", description: "Video duration in seconds." }),
    prompt: nullable(str("Prompt that produced the media.")),
    packId: nullable(str("Pack slug, when generated from a pack.")),
    modelId: nullable(str("Identity model used.")),
    jobId: nullable(str("Job that produced the media.")),
    parentMediaId: nullable(str("Source media for edits, upscales and videos.")),
    folderId: nullable(str("Gallery folder.")),
    isDraft: bool("Free low-cost preview; re-render it at full quality with `fromDraftMediaId`."),
    isFavorite: bool("Marked as favorite."),
    hidden: bool("Hidden by the best-shots picker (still downloadable)."),
    watermarked: bool("Carries a visible watermark (free plan before the first purchase)."),
    scores: nullable(ref("MediaScores")),
    createdAt: dateTime("Creation time."),
  },
);

export const JobInputSchema: JsonSchema = {
  type: "object",
  description:
    'The validated job input: the request body with defaults applied (see CreateJobRequest). Training jobs have `type: "train"`.',
  required: ["type"],
  properties: { type: enumOf(JOB_TYPES, "Job type.") },
  additionalProperties: true,
};

export const JobSchema = dto<JobDTO>(
  "A generation job. Credits are charged up front and refunded automatically on failure.",
  {
    id: id("job", "Job"),
    type: enumOf(JOB_TYPES, "Job type."),
    status: enumOf(
      JOB_STATUSES,
      "`queued` → `running` → `succeeded`, or `failed` / `canceled` / `blocked` (credits refunded).",
    ),
    progress: int("Progress 0-100 (best effort).", { minimum: 0, maximum: 100 }),
    error: nullable(str("Human-readable failure reason.")),
    errorCode: nullable(
      str("Machine-readable failure code, e.g. `provider_error`, `content_blocked`, `canceled`, `timeout`."),
    ),
    creditsCharged: int("Credits charged when the job was created.", { minimum: 0 }),
    creditsRefunded: int("Credits refunded so far (failures, blocked or missing outputs).", { minimum: 0 }),
    modelId: nullable(str("Identity model used.")),
    packId: nullable(str("Pack slug.")),
    batchId: nullable(str("Batch the job belongs to.")),
    input: ref("JobInput"),
    media: { type: "array", items: ref("Media"), description: "Results, best shots first (visible before hidden)." },
    blockedCount: int("Outputs discarded by the safety filter (never stored).", { minimum: 0 }),
    createdAt: dateTime("Creation time."),
    completedAt: nullable(dateTime("When the job reached a terminal status.")),
  },
);

export const BatchSchema = dto<BatchDTO>("A batch: one pack → many single-image generate jobs.", {
  id: id("bat", "Batch"),
  modelId: nullable(str("Identity model used.")),
  packId: nullable(str("Pack slug.")),
  brandKitId: nullable(str("Team brand kit applied.")),
  total: int("Number of jobs in the batch.", { minimum: 0 }),
  completed: int("Jobs that succeeded.", { minimum: 0 }),
  failed: int("Jobs that failed, were canceled or blocked.", { minimum: 0 }),
  status: enumOf(["running", "completed", "failed", "canceled"], "Batch status."),
  createdAt: dateTime("Creation time."),
  updatedAt: dateTime("Last counter update."),
});

export const IdentityModelSchema = dto<IdentityModelDTO>(
  "A private identity model (your trained or instant likeness), or one shared with you through a multi-person invite.",
  {
    id: id("mdl", "Model"),
    name: str("Display name."),
    subject: enumOf(SUBJECTS, "Subject used in prompts."),
    status: enumOf(MODEL_STATUSES, "Only `ready` models can generate."),
    mode: enumOf(["instant", "trained"], "`instant` (reference-based, no training) or `trained` (best likeness)."),
    triggerWord: str("Unique token that refers to this identity in prompts."),
    coverUrl: nullable(str("Signed cover image URL.", { format: "uri" })),
    photoCount: int("Training photos uploaded.", { minimum: 0 }),
    acceptedPhotoCount: int("Training photos that passed the quality + safety checks.", { minimum: 0 }),
    consentVerified: bool("The live consent selfie was verified."),
    trainingJobId: nullable(str("Training job id.")),
    shared: bool("True when the model belongs to someone else and was shared with you."),
    ownerName: nullable(str("Owner's name (shared models only).")),
    createdAt: dateTime("Creation time."),
    trainedAt: nullable(dateTime("When training finished.")),
  },
  ["ownerName"],
);

/** Exhaustive (a Record), so a new PhotoIssueCode can't be forgotten here. */
const PHOTO_ISSUE_CODES: Record<PhotoIssueCode, true> = {
  unreadable: true,
  too_small: true,
  blurry: true,
  too_dark: true,
  too_bright: true,
  low_contrast: true,
  no_face: true,
  multiple_faces: true,
  face_too_small: true,
  face_cut_off: true,
  extreme_angle: true,
  duplicate: true,
  face_mismatch: true,
  underage: true,
  nsfw: true,
};

export const PhotoIssueSchema = dto<PhotoIssue>("A problem found in a training photo, with a fix-it tip.", {
  code: enumOf(Object.keys(PHOTO_ISSUE_CODES), "Issue code."),
  severity: enumOf(["error", "warning"], "`error` photos are rejected; `warning` photos are accepted."),
  message: str("What is wrong, in plain language."),
  fix: str("How to fix it, in plain language."),
});

const num = (description: string): JsonSchema => ({ type: "number", description });

export const PhotoQualityReportSchema = dto<PhotoQualityReport>("Quality check of one training photo.", {
  score: int("Overall quality 0-100.", { minimum: 0, maximum: 100 }),
  issues: { type: "array", items: ref("PhotoIssue"), description: "Problems found (empty when the photo is great)." },
  metrics: {
    type: "object",
    description: "Raw measurements.",
    required: ["width", "height", "sharpness", "brightness", "contrast"],
    properties: {
      width: int("Width in pixels."),
      height: int("Height in pixels."),
      sharpness: num("Variance of the Laplacian; higher is sharper."),
      brightness: num("Mean luminance 0-255."),
      contrast: num("Standard deviation of luminance."),
      faceAreaRatio: num("Face box area / image area."),
      yaw: num("Head yaw in degrees (negative = left)."),
      pitch: num("Head pitch in degrees."),
    } satisfies { [K in keyof PhotoQualityReport["metrics"]]-?: JsonSchema },
  },
});

export const TrainingPhotoSchema = dto<TrainingPhotoDTO>("A training selfie of one of your models.", {
  id: id("tph", "Training photo"),
  url: str("Signed URL (expires).", { format: "uri" }),
  thumbUrl: str("Signed thumbnail URL (expires).", { format: "uri" }),
  status: enumOf(PHOTO_STATUSES, "`accepted` photos are used for training."),
  quality: nullable(ref("PhotoQualityReport")),
  faceMatchScore: nullable({
    type: "number",
    minimum: 0,
    maximum: 1,
    description: "Similarity to the consent selfie.",
  }),
  createdAt: dateTime("Upload time."),
});

const poseCount = (pose: string) => int(`Accepted photos with a ${pose} head pose.`, { minimum: 0 });

export const ReadinessSchema = dto<ReadinessDTO>("Whether a model has enough good photos to be created/trained.", {
  total: int("Photos uploaded.", { minimum: 0 }),
  accepted: int("Photos accepted.", { minimum: 0 }),
  rejected: int("Photos rejected.", { minimum: 0 }),
  minRequired: int("Accepted photos needed.", { minimum: 0 }),
  maxAllowed: int("Maximum photos.", { minimum: 0 }),
  variety: {
    type: "object",
    description: "Accepted photos by head-pose bucket.",
    required: ["frontal", "left", "right", "up", "down"],
    properties: {
      frontal: poseCount("frontal"),
      left: poseCount("left"),
      right: poseCount("right"),
      up: poseCount("upward"),
      down: poseCount("downward"),
    } satisfies { [K in keyof ReadinessDTO["variety"]]-?: JsonSchema },
  },
  canTrain: bool("All requirements met."),
  blockers: { type: "array", items: { type: "string" }, description: "What still blocks training." },
  tips: { type: "array", items: { type: "string" }, description: "Suggestions for better results." },
});

export const CreditLedgerEntrySchema = dto<CreditLedgerEntryDTO>("One credit ledger entry (append-only).", {
  id: id("crd", "Ledger entry"),
  delta: int("Credits added (positive) or spent (negative)."),
  balanceAfter: int("Balance after this entry."),
  reason: enumOf(CREDIT_REASONS, "Why the balance changed."),
  jobId: nullable(str("Related job.")),
  note: nullable(str("Free-form note.")),
  createdAt: dateTime("Creation time."),
});

export const PackSummarySchema = dto<PackSummary>(
  "A themed photo pack. Use its `slug` as `packId`.",
  {
    slug: str("Pack id (`packId` in requests).", { examples: ["linkedin-headshots"] }),
    name: str("Display name."),
    tagline: str("One-line description."),
    description: str("Longer description."),
    category: enumOf(PACK_CATEGORIES, "Category."),
    emoji: str("Emoji shown with the pack."),
    tags: { type: "array", items: { type: "string" }, description: "Search tags." },
    colors: {
      type: "array",
      prefixItems: [{ type: "string" }, { type: "string" }],
      minItems: 2,
      maxItems: 2,
      description: "Card gradient colors (hex).",
    },
    cover: str("Cover image path."),
    featured: bool("Featured pack."),
    isNew: bool("Recently added."),
    promptCount: int("Number of prompts in the pack.", { minimum: 0 }),
    sampleTitles: { type: "array", items: { type: "string" }, description: "A few prompt titles." },
  },
  ["emoji", "colors", "cover"],
);

export const ErrorSchema: JsonSchema = {
  type: "object",
  description: "Every error response has this shape.",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: enumOf(API_ERROR_CODES, "Machine-readable error code."),
        message: str("Human-readable message (safe to show to users)."),
        details: { description: "Optional extra data, e.g. validation issues or `{ retryAfterSec }`." },
      },
    },
  },
};

/** Response DTO schemas, keyed by component name. */
export const DTO_SCHEMAS = {
  Media: MediaSchema,
  MediaScores: MediaScoresSchema,
  Job: JobSchema,
  JobInput: JobInputSchema,
  Batch: BatchSchema,
  IdentityModel: IdentityModelSchema,
  TrainingPhoto: TrainingPhotoSchema,
  PhotoQualityReport: PhotoQualityReportSchema,
  PhotoIssue: PhotoIssueSchema,
  Readiness: ReadinessSchema,
  CreditLedgerEntry: CreditLedgerEntrySchema,
  PackSummary: PackSummarySchema,
  Error: ErrorSchema,
} satisfies Record<string, JsonSchema>;
