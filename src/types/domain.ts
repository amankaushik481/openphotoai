/**
 * Shared domain types + Zod schemas.
 * CONTRACT FILE — see docs/CONTRACTS.md. Changing anything here requires updating
 * CONTRACTS.md and every affected workstream.
 */
import { z } from "zod";

/* ───────────── Enums (stored as text in Postgres) ───────────── */

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PLAN_IDS = ["free", "starter", "pro", "studio"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const SUBJECTS = ["man", "woman", "person"] as const;
export type Subject = (typeof SUBJECTS)[number];

export const MODEL_STATUSES = [
  "awaiting_consent", // created, needs live consent selfie
  "collecting", // consent verified, user uploads training photos
  "training", // training job running
  "ready", // trained, usable
  "failed", // training failed (credits refunded)
  "deleting", // deletion in progress
] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];

export const PHOTO_STATUSES = ["pending", "accepted", "rejected"] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

export const JOB_TYPES = [
  "train",
  "generate",
  "pose_copy",
  "edit",
  "inpaint",
  "upscale",
  "face_restore",
  "remove_background",
  "video",
  "talking_video",
  "try_on",
  "multi_person",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = [
  "queued", // created, not yet submitted to provider
  "running", // submitted to provider
  "succeeded",
  "failed", // provider/internal failure -> credits refunded
  "canceled", // user canceled -> credits refunded
  "blocked", // safety blocked all outputs -> credits refunded
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ["succeeded", "failed", "canceled", "blocked"];

export type AIProviderName = "mock" | "fal" | "replicate";
export type PaymentProviderName = "stripe" | "mock";
export type MediaKind = "image" | "video";
export type BatchStatus = "running" | "completed" | "failed" | "canceled";
export type InviteStatus = "pending" | "accepted" | "declined" | "revoked" | "expired";
export type ConsentKind = "training_selfie" | "multi_person";
export type TeamRole = "owner" | "admin" | "member";
export type ReportStatus = "open" | "actioned" | "dismissed";
export type EmailStatus = "sent" | "failed" | "mocked";
export type DeletionStatus = "pending" | "confirmed" | "completed" | "expired";
export type ApiKeyScope = "*" | "read" | "generate";
export type PaymentKind = "credit_pack" | "subscription";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "unpaid";

export const CREDIT_REASONS = [
  "signup_bonus",
  "purchase", // one-time credit pack
  "subscription_grant", // monthly/annual plan credits
  "job_debit",
  "job_refund",
  "admin_adjust",
  "transfer_in", // team owner -> member
  "transfer_out",
  "purchase_reversal", // refund/chargeback of a purchase removes the credits
] as const;
export type CreditReason = (typeof CREDIT_REASONS)[number];

export const MODERATION_EVENT_KINDS = [
  "prompt_blocked",
  "output_blocked",
  "reference_blocked",
  "public_figure",
  "face_mismatch",
  "underage",
  "no_face",
  "multiple_faces",
  "consent_failed",
  "multi_person_unauthorized",
  "report_actioned",
  "account_suspended",
  /** A chargeback was opened (or closed) on one of the user's payments: review the account. */
  "payment_disputed",
] as const;
export type ModerationEventKind = (typeof MODERATION_EVENT_KINDS)[number];

/* ───────────── JSON column shapes ───────────── */

export type PhotoIssueCode =
  | "unreadable"
  | "too_small"
  | "blurry"
  | "too_dark"
  | "too_bright"
  | "low_contrast"
  | "no_face"
  | "multiple_faces"
  | "face_too_small"
  | "face_cut_off"
  | "extreme_angle"
  | "duplicate"
  | "face_mismatch"
  | "underage"
  | "nsfw";

export interface PhotoIssue {
  code: PhotoIssueCode;
  severity: "error" | "warning";
  /** What is wrong, in plain language. */
  message: string;
  /** How to fix it, in plain language. */
  fix: string;
}

export interface PhotoQualityReport {
  /** 0-100 overall quality score. */
  score: number;
  issues: PhotoIssue[];
  metrics: {
    width: number;
    height: number;
    /** Variance of Laplacian on a normalized grayscale image; higher = sharper. */
    sharpness: number;
    /** Mean luminance 0-255. */
    brightness: number;
    /** Std-dev of luminance. */
    contrast: number;
    /** Face bounding box area / image area. */
    faceAreaRatio?: number;
    /** Head pose in degrees (negative = left). */
    yaw?: number;
    pitch?: number;
  };
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Face analysis stored on rows (embeddings are NOT exposed via the API). */
export interface FaceAnalysisSummary {
  count: number;
  primary?: {
    box: FaceBox;
    confidence: number;
    age?: number;
    yaw?: number;
    pitch?: number;
    roll?: number;
  };
}

export interface MediaScores {
  /** 0..1 similarity of the face to the user's identity. */
  likeness?: number;
  /** 0..1 technical/aesthetic quality. */
  quality?: number;
  /** 0..1 combined score used by the best-shots picker. */
  overall: number;
}

export interface ModerationSnapshot {
  checkedAt: string;
  provider: string;
  allowed: boolean;
  categories: string[];
}

/* ───────────── Job inputs (request bodies for POST /api/jobs) ───────────── */

export const ASPECT_RATIOS = ["1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "3:2", "5:4"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export const aspectRatioSchema = z.enum(ASPECT_RATIOS);

export const QUALITY_LEVELS = ["draft", "standard", "high"] as const;
export type Quality = (typeof QUALITY_LEVELS)[number];

const id = z.string().min(1).max(64);
const prompt = z.string().trim().max(1500);

export const trainJobInput = z.object({
  type: z.literal("train"),
  modelId: id,
});

export const generateJobInput = z
  .object({
    type: z.literal("generate"),
    modelId: id,
    /** Free-form prompt. Use the identity token placeholder "{subject}" or let the engine prepend it. */
    prompt: prompt.optional(),
    /** Generate from a pack (prompts come from packs/<slug>.json). */
    packId: z.string().max(80).optional(),
    /** Which of the pack's prompts to use; omitted = engine picks round-robin/random. */
    packPromptIndex: z.number().int().min(0).max(500).optional(),
    /** Optional style/composition reference image (uploads.id with purpose "reference"). */
    referenceUploadId: id.optional(),
    quality: z.enum(QUALITY_LEVELS).default("standard"),
    numImages: z.number().int().min(1).max(4).default(4),
    aspectRatio: aspectRatioSchema.default("4:5"),
    seed: z.number().int().min(0).max(2_147_483_647).optional(),
    /** Re-render a draft at full quality (same prompt + seed). */
    fromDraftMediaId: id.optional(),
    /** Apply a team brand kit (background/outfit/style). */
    brandKitId: id.optional(),
  })
  .refine((v) => Boolean(v.prompt || v.packId || v.fromDraftMediaId), {
    message: "Provide a prompt, a packId or fromDraftMediaId",
  });

export const poseCopyJobInput = z.object({
  type: z.literal("pose_copy"),
  modelId: id,
  /** uploads.id (purpose "reference") — the photo whose pose/setting to copy. */
  referenceUploadId: id,
  prompt: prompt.optional(),
  aspectRatio: aspectRatioSchema.optional(),
  numImages: z.number().int().min(1).max(4).default(2),
});

export const EDIT_KINDS = ["outfit", "background", "hair", "expression", "custom"] as const;
export const editJobInput = z.object({
  type: z.literal("edit"),
  /** Edits operate only on media generated by OpenShoot for this user (see DECISIONS.md). */
  sourceMediaId: id,
  edit: z.enum(EDIT_KINDS),
  instruction: z.string().trim().min(2).max(800),
  numImages: z.number().int().min(1).max(4).default(1),
});

export const inpaintJobInput = z.object({
  type: z.literal("inpaint"),
  sourceMediaId: id,
  /** uploads.id (purpose "mask"): white = repaint, black = keep. */
  maskUploadId: id,
  prompt: z.string().trim().min(2).max(800),
});

export const upscaleJobInput = z.object({
  type: z.literal("upscale"),
  sourceMediaId: id,
  scale: z.union([z.literal(2), z.literal(4)]).default(2),
  faceRestore: z.boolean().default(true),
});

export const faceRestoreJobInput = z.object({
  type: z.literal("face_restore"),
  sourceMediaId: id,
});

export const removeBackgroundJobInput = z.object({
  type: z.literal("remove_background"),
  sourceMediaId: id,
});

export const videoJobInput = z.object({
  type: z.literal("video"),
  sourceMediaId: id,
  prompt: z.string().trim().max(800).optional(),
  durationSec: z.union([z.literal(5), z.literal(10)]).default(5),
  aspectRatio: aspectRatioSchema.optional(),
});

export const VOICES = ["warm_female", "bright_female", "calm_male", "deep_male", "neutral"] as const;
export const talkingVideoJobInput = z.object({
  type: z.literal("talking_video"),
  sourceMediaId: id,
  script: z.string().trim().min(2).max(600),
  voice: z.enum(VOICES).default("neutral"),
});

export const TRY_ON_CATEGORIES = ["auto", "tops", "bottoms", "one-pieces"] as const;
export const tryOnJobInput = z.object({
  type: z.literal("try_on"),
  /** A photo of you generated by OpenShoot. */
  personMediaId: id,
  /** uploads.id (purpose "garment"). */
  garmentUploadId: id,
  category: z.enum(TRY_ON_CATEGORIES).default("auto"),
});

export const multiPersonJobInput = z
  .object({
    type: z.literal("multi_person"),
    /** 2 identity models: each must be owned by the user or shared with them via an accepted invite. */
    modelIds: z.array(id).min(2).max(2),
    prompt: prompt.optional(),
    packId: z.string().max(80).optional(),
    aspectRatio: aspectRatioSchema.default("4:5"),
    numImages: z.number().int().min(1).max(4).default(2),
  })
  .refine((v) => Boolean(v.prompt || v.packId), { message: "Provide a prompt or a packId" })
  .refine((v) => new Set(v.modelIds).size === v.modelIds.length, { message: "modelIds must be distinct" });

/** Body of POST /api/jobs and POST /api/v1/jobs. ("train" is created via POST /api/models/:id/train.) */
export const createJobRequest = z.discriminatedUnion("type", [
  generateJobInput,
  poseCopyJobInput,
  editJobInput,
  inpaintJobInput,
  upscaleJobInput,
  faceRestoreJobInput,
  removeBackgroundJobInput,
  videoJobInput,
  talkingVideoJobInput,
  tryOnJobInput,
  multiPersonJobInput,
]);
export type CreateJobRequest = z.infer<typeof createJobRequest>;

export const jobInputSchema = z.discriminatedUnion("type", [
  trainJobInput,
  generateJobInput,
  poseCopyJobInput,
  editJobInput,
  inpaintJobInput,
  upscaleJobInput,
  faceRestoreJobInput,
  removeBackgroundJobInput,
  videoJobInput,
  talkingVideoJobInput,
  tryOnJobInput,
  multiPersonJobInput,
]);
export type JobInput = z.infer<typeof jobInputSchema>;
export type JobInputOf<T extends JobType> = Extract<JobInput, { type: T }>;

/** Body of POST /api/batches: one pack -> many images in one click. */
export const createBatchRequest = z.object({
  modelId: id,
  packId: z.string().max(80),
  /** Total images to create (spread across the pack's prompts). */
  count: z.number().int().min(1).max(50),
  quality: z.enum(["standard", "high"]).default("standard"),
  aspectRatio: aspectRatioSchema.optional(),
  brandKitId: id.optional(),
});
export type CreateBatchRequest = z.infer<typeof createBatchRequest>;

/** Stored on jobs.output once a job finishes. */
export interface JobOutput {
  mediaIds?: string[];
  /** How many outputs were blocked by the safety module (never stored or shown). */
  blockedCount?: number;
  /** For training jobs: provider model reference (LoRA URL / version). */
  modelRef?: string;
  /** Final (expanded) prompt actually sent to the provider. */
  finalPrompt?: string;
  seed?: number;
  [key: string]: unknown;
}

/* ───────────── API DTOs ───────────── */

export interface MediaDTO {
  id: string;
  kind: MediaKind;
  url: string;
  thumbUrl: string;
  downloadUrl: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  prompt: string | null;
  packId: string | null;
  modelId: string | null;
  jobId: string | null;
  parentMediaId: string | null;
  folderId: string | null;
  isDraft: boolean;
  isFavorite: boolean;
  hidden: boolean;
  watermarked: boolean;
  scores: MediaScores | null;
  createdAt: string;
}

export interface JobDTO {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  error: string | null;
  errorCode: string | null;
  creditsCharged: number;
  creditsRefunded: number;
  modelId: string | null;
  packId: string | null;
  batchId: string | null;
  input: JobInput;
  media: MediaDTO[];
  blockedCount: number;
  createdAt: string;
  completedAt: string | null;
}

export interface BatchDTO {
  id: string;
  modelId: string | null;
  packId: string | null;
  brandKitId: string | null;
  total: number;
  completed: number;
  failed: number;
  status: BatchStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityModelDTO {
  id: string;
  name: string;
  subject: Subject;
  status: ModelStatus;
  /** "instant" (reference-based) or "trained" (LoRA). From identity_models.metadata.mode; defaults to "trained". */
  mode: "instant" | "trained";
  triggerWord: string;
  coverUrl: string | null;
  photoCount: number;
  acceptedPhotoCount: number;
  consentVerified: boolean;
  trainingJobId: string | null;
  /** True when the model belongs to someone else and was shared via multi-person consent. */
  shared: boolean;
  ownerName?: string | null;
  createdAt: string;
  trainedAt: string | null;
}

export interface TrainingPhotoDTO {
  id: string;
  url: string;
  thumbUrl: string;
  status: PhotoStatus;
  quality: PhotoQualityReport | null;
  faceMatchScore: number | null;
  createdAt: string;
}

export interface ReadinessDTO {
  total: number;
  accepted: number;
  rejected: number;
  minRequired: number;
  maxAllowed: number;
  /** Count of accepted photos by head-pose bucket. */
  variety: { frontal: number; left: number; right: number; up: number; down: number };
  canTrain: boolean;
  blockers: string[];
  tips: string[];
}

export interface CreditLedgerEntryDTO {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: CreditReason;
  jobId: string | null;
  note: string | null;
  createdAt: string;
}

export interface MeDTO {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: UserRole;
  credits: number;
  plan: PlanId;
  hasPaid: boolean;
  watermark: boolean;
  /** Free draft previews left today (draftsPerDay, or draftsPerDayFree before the first purchase). */
  draftsRemaining: number;
  marketingOptIn: boolean;
  createdAt: string;
}

export interface ApiKeyDTO {
  id: string;
  name: string;
  /** First characters of the key, e.g. "os_live_ab12". */
  prefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt: string | null;
  createdAt: string;
}

/** Uniform error body for every API route: `{ error: { code, message, details? } }`. */
export const API_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_error",
  "insufficient_credits",
  "rate_limited",
  "content_blocked",
  "consent_required",
  "conflict",
  "payload_too_large",
  "provider_error",
  "plan_limit",
  "suspended",
  "internal",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}
