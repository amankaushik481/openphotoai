/**
 * Example payloads for the OpenAPI document and the docs page. Typed against the DTOs / request
 * schemas, so they can't silently go stale (request examples are also parsed with Zod in tests).
 */
import type { z } from "zod";
import type {
  BatchDTO,
  createBatchRequest,
  createJobRequest,
  CreditLedgerEntryDTO,
  IdentityModelDTO,
  JobDTO,
  MediaDTO,
  ReadinessDTO,
  TrainingPhotoDTO,
} from "@/types/domain";
import type { PackSummary } from "@/types/pack";

type CreateJobBody = z.input<typeof createJobRequest>;
type CreateBatchBody = z.input<typeof createBatchRequest>;

const MODEL_ID = "mdl_8f2k1m9q3w7e5r2t4y6u";
const JOB_ID = "job_3n7v1c9x5z2b8m4k6j0h";
const MEDIA_ID = "med_q1w2e3r4t5y6u7i8o9p0";
const BATCH_ID = "bat_a1s2d3f4g5h6j7k8l9z0";
const CREATED = "2026-05-01T12:00:00.000Z";
const SIGNED = "?exp=1777640400&sig=3c9d0e";

export const createJobExamples: Record<string, { summary: string; value: CreateJobBody }> = {
  prompt: {
    summary: "Generate from a prompt",
    value: {
      type: "generate",
      modelId: MODEL_ID,
      prompt: "professional headshot of {subject}, navy blazer, soft studio light",
      numImages: 4,
      aspectRatio: "4:5",
      quality: "standard",
    },
  },
  pack: {
    summary: "Generate from a pack",
    value: { type: "generate", modelId: MODEL_ID, packId: "linkedin-headshots", numImages: 2 },
  },
  draft: {
    summary: "Free draft preview",
    value: { type: "generate", modelId: MODEL_ID, prompt: "{subject} hiking in the Alps at sunrise", quality: "draft" },
  },
  upscale: {
    summary: "Upscale a photo 4×",
    value: { type: "upscale", sourceMediaId: MEDIA_ID, scale: 4 },
  },
  edit: {
    summary: "Change the outfit",
    value: { type: "edit", sourceMediaId: MEDIA_ID, edit: "outfit", instruction: "a charcoal three-piece suit" },
  },
  video: {
    summary: "Photo → 5 s video",
    value: { type: "video", sourceMediaId: MEDIA_ID, prompt: "slow smile, gentle head turn", durationSec: 5 },
  },
};

export const createBatchExample: { summary: string; value: CreateBatchBody } = {
  summary: "20 images from a pack",
  value: { modelId: MODEL_ID, packId: "linkedin-headshots", count: 20, quality: "standard" },
};

export const mediaExample: MediaDTO = {
  id: MEDIA_ID,
  kind: "image",
  url: `https://openshoot.example/api/files/users/usr_x/media/${MEDIA_ID}.jpg${SIGNED}`,
  thumbUrl: `https://openshoot.example/api/files/users/usr_x/media/${MEDIA_ID}-thumb.webp${SIGNED}`,
  downloadUrl: `https://openshoot.example/api/files/users/usr_x/media/${MEDIA_ID}.jpg${SIGNED}&dl=openshoot-${MEDIA_ID}.jpg`,
  mimeType: "image/jpeg",
  width: 1024,
  height: 1280,
  durationSec: null,
  prompt: "professional headshot of ohwxkqmzt person, navy blazer, soft studio light",
  packId: null,
  modelId: MODEL_ID,
  jobId: JOB_ID,
  parentMediaId: null,
  folderId: null,
  isDraft: false,
  isFavorite: false,
  hidden: false,
  watermarked: false,
  scores: { likeness: 0.91, quality: 0.84, overall: 0.88 },
  createdAt: "2026-05-01T12:00:21.000Z",
};

export const runningJobExample: JobDTO = {
  id: JOB_ID,
  type: "generate",
  status: "running",
  progress: 1,
  error: null,
  errorCode: null,
  creditsCharged: 4,
  creditsRefunded: 0,
  modelId: MODEL_ID,
  packId: null,
  batchId: null,
  input: {
    type: "generate",
    modelId: MODEL_ID,
    prompt: "professional headshot of {subject}, navy blazer, soft studio light",
    quality: "standard",
    numImages: 4,
    aspectRatio: "4:5",
  },
  media: [],
  blockedCount: 0,
  createdAt: CREATED,
  completedAt: null,
};

export const succeededJobExample: JobDTO = {
  ...runningJobExample,
  status: "succeeded",
  progress: 100,
  media: [mediaExample],
  completedAt: "2026-05-01T12:00:22.000Z",
};

export const batchExample: BatchDTO = {
  id: BATCH_ID,
  modelId: MODEL_ID,
  packId: "linkedin-headshots",
  brandKitId: null,
  total: 20,
  completed: 7,
  failed: 0,
  status: "running",
  createdAt: CREATED,
  updatedAt: "2026-05-01T12:00:40.000Z",
};

export const modelExample: IdentityModelDTO = {
  id: MODEL_ID,
  name: "Me",
  subject: "person",
  status: "ready",
  mode: "trained",
  triggerWord: "ohwxkqmzt",
  coverUrl: null,
  photoCount: 18,
  acceptedPhotoCount: 16,
  consentVerified: true,
  trainingJobId: "job_t1r2a3i4n5j6o7b8i9d0",
  shared: false,
  createdAt: "2026-04-30T09:00:00.000Z",
  trainedAt: "2026-04-30T09:21:00.000Z",
};

export const trainingPhotoExample: TrainingPhotoDTO = {
  id: "tph_p1h2o3t4o5s6e7l8f9i0",
  url: `https://openshoot.example/api/files/users/usr_x/models/${MODEL_ID}/photos/tph_p1h2o3t4o5s6e7l8f9i0.jpg${SIGNED}`,
  thumbUrl: `https://openshoot.example/api/files/users/usr_x/models/${MODEL_ID}/photos/tph_p1h2o3t4o5s6e7l8f9i0-thumb.webp${SIGNED}`,
  status: "accepted",
  quality: {
    score: 86,
    issues: [
      {
        code: "extreme_angle",
        severity: "warning",
        message: "Your head is turned quite far.",
        fix: "Add a few photos looking straight at the camera.",
      },
    ],
    metrics: {
      width: 1536,
      height: 2048,
      sharpness: 412.5,
      brightness: 131,
      contrast: 52.3,
      faceAreaRatio: 0.11,
      yaw: -31,
      pitch: 4,
    },
  },
  faceMatchScore: 0.93,
  createdAt: "2026-04-30T09:02:00.000Z",
};

export const readinessExample: ReadinessDTO = {
  total: 18,
  accepted: 16,
  rejected: 2,
  minRequired: 10,
  maxAllowed: 30,
  variety: { frontal: 9, left: 3, right: 2, up: 1, down: 1 },
  canTrain: true,
  blockers: [],
  tips: ["Add a couple more photos looking to the right for more varied results."],
};

export const ledgerExample: CreditLedgerEntryDTO = {
  id: "crd_l1e2d3g4e5r6e7n8t9r0",
  delta: -4,
  balanceAfter: 596,
  reason: "job_debit",
  jobId: JOB_ID,
  note: null,
  createdAt: CREATED,
};

export const packExample: PackSummary = {
  slug: "linkedin-headshots",
  name: "LinkedIn Headshots",
  tagline: "Polished, approachable headshots that get you hired.",
  description: "Studio and office headshots with flattering light and professional wardrobe.",
  category: "professional",
  emoji: "💼",
  tags: ["linkedin", "headshot", "corporate"],
  featured: true,
  isNew: false,
  promptCount: 24,
  sampleTitles: ["Studio grey backdrop", "Modern office", "Outdoor city", "Warm window light"],
};

export const ids = { MODEL_ID, JOB_ID, MEDIA_ID, BATCH_ID } as const;
