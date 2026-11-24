/**
 * Training-photo quality checker: technical checks (resolution, blur, exposure, contrast, face
 * size / framing / pose, near-duplicates) merged with the safety analysis (face matches the consent
 * selfie, adults only, no sexual content). Every issue has a plain-language message and a fix tip.
 *
 * Calibrated on tests/fixtures/selfies (see tests/unit/models/quality.test.ts): sharp selfies
 * measure ~190-440 face-region Laplacian variance and ~95-175 face brightness; blurry-01 ≈ 3,
 * dark-01 ≈ 22 brightness. Real phone selfies sit well above the warning levels below.
 */
import sharp from "sharp";
import { TRAINING } from "@/config/app";
import { cropRegion, hammingDistance, imageMetrics, perceptualHash } from "@/server/images/process";
import { analyzeTrainingPhotoSafety, type SafetyContext } from "@/server/safety";
import type { FaceAnalysisSummary, FaceBox, PhotoIssue, PhotoIssueCode, PhotoQualityReport, PhotoStatus } from "@/types/domain";

export const QUALITY_THRESHOLDS = {
  /** Shortest side in pixels. */
  minSide: TRAINING.minSide,
  /** Laplacian variance of the face region (≤384px grey): below = too blurry to learn from. */
  blurError: 40,
  /** Below = soft (still usable). */
  blurWarning: 90,
  /** Mean luminance (0-255) of the face region. */
  darkError: 45,
  darkWarning: 70,
  brightError: 225,
  brightWarning: 205,
  /** Std-dev of luminance over the whole photo (flat / hazy images). */
  lowContrastError: 12,
  lowContrastWarning: 22,
  /** Face box area / image area. */
  minFaceAreaRatio: TRAINING.minFaceAreaRatio,
  smallFaceWarningRatio: 0.05,
  /** A face box closer than this share of the frame to an edge counts as cut off. */
  edgeMargin: 0.005,
  /** Head pose in degrees beyond which the photo gets a warning. */
  extremeYaw: 45,
  extremePitch: 35,
  /** dHash Hamming distance (of 64 bits) at or below which two photos are near-duplicates. */
  duplicateHamming: 6,
} as const;

/** Face crops are resized to this longest side before measuring sharpness (comparable scale). */
const FACE_REGION_SIDE = 384;
const FACE_REGION_PAD = 0.1;

/** Safety issue codes: photos with any of these are never stored (see photos.ts). */
export const SAFETY_ISSUE_CODES: ReadonlySet<PhotoIssueCode> = new Set<PhotoIssueCode>([
  "unreadable",
  "no_face",
  "multiple_faces",
  "face_mismatch",
  "underage",
  "nsfw",
]);

type IssueTemplate = Omit<PhotoIssue, "severity">;

const ISSUES = {
  too_small: {
    code: "too_small",
    message: "This photo is too small to learn your face from.",
    fix: `Use the original photo from your camera or gallery (at least ${TRAINING.minSide} pixels on the shortest side), not a screenshot or thumbnail.`,
  },
  blurry: {
    code: "blurry",
    message: "This photo is too blurry.",
    fix: "Hold the camera steady, tap your face to focus and avoid zoomed-in or heavily compressed photos.",
  },
  soft: {
    code: "blurry",
    message: "This photo is a little soft.",
    fix: "Sharper photos give a better likeness. Try one taken in good light with the camera held still.",
  },
  too_dark: {
    code: "too_dark",
    message: "This photo is too dark to see your face clearly.",
    fix: "Take photos in daylight or a bright room, facing the light (a window works great).",
  },
  dim: {
    code: "too_dark",
    message: "Your face is a bit dark in this photo.",
    fix: "Face a window or lamp so your face is evenly lit.",
  },
  too_bright: {
    code: "too_bright",
    message: "This photo is overexposed, so parts of your face are washed out.",
    fix: "Avoid harsh sun or flash on your face. Soft daylight or shade works best.",
  },
  bright: {
    code: "too_bright",
    message: "This photo is quite bright.",
    fix: "Soft, even light keeps skin detail. Try a photo in shade or indirect daylight.",
  },
  flat: {
    code: "low_contrast",
    message: "This photo looks very flat or hazy.",
    fix: "Wipe the camera lens, don't shoot through glass and use even, natural light.",
  },
  lowContrast: {
    code: "low_contrast",
    message: "This photo looks a little flat.",
    fix: "Photos with natural light and a clear background give better results.",
  },
  face_too_small: {
    code: "face_too_small",
    message: "Your face is too small in this photo.",
    fix: "Use photos where your face fills a good part of the frame (head and shoulders), or crop the photo closer.",
  },
  faceSmallish: {
    code: "face_too_small",
    message: "Your face is quite small in this photo.",
    fix: "Closer shots (head and shoulders) give the best likeness.",
  },
  face_cut_off: {
    code: "face_cut_off",
    message: "Part of your face is cut off at the edge of the photo.",
    fix: "Use photos where your whole face, from forehead to chin, is inside the frame.",
  },
  extreme_angle: {
    code: "extreme_angle",
    message: "Your head is turned a lot in this photo.",
    fix: "A few side angles help, but keep most photos facing the camera or slightly turned, with both eyes visible.",
  },
  duplicate: {
    code: "duplicate",
    message: "This looks like a photo you already uploaded.",
    fix: "Use different photos: vary your outfit, background, expression and lighting.",
  },
} as const satisfies Record<string, IssueTemplate>;

export interface AnalyzeTrainingPhotoInput {
  /** Normalized JPEG bytes (EXIF stripped, auto-rotated), see normalizeImage(). */
  bytes: Uint8Array;
  /** L2-normalized embedding of the model's live consent selfie. */
  consentEmbedding: number[];
  /** pHashes of photos already in the training set (near-duplicate check). */
  existingPhashes?: readonly (string | null | undefined)[];
  ctx: SafetyContext;
}

export interface TrainingPhotoAnalysis {
  /** "accepted" iff no error-severity issue. */
  status: Extract<PhotoStatus, "accepted" | "rejected">;
  quality: PhotoQualityReport;
  face: FaceAnalysisSummary;
  faceMatchScore: number | null;
  ageEstimate: number | null;
  phash: string;
  /** True when a safety check failed (consent mismatch, minors, nsfw, no/several faces, check error). */
  safetyRejected: boolean;
}

/** Analyze one training photo: technical quality + safety. Never stores anything itself. */
export async function analyzeTrainingPhoto(input: AnalyzeTrainingPhotoInput): Promise<TrainingPhotoAnalysis> {
  const { bytes, consentEmbedding, existingPhashes = [], ctx } = input;
  const [global, phash, safety] = await Promise.all([
    imageMetrics(bytes),
    perceptualHash(bytes),
    analyzeTrainingPhotoSafety(bytes, consentEmbedding, ctx),
  ]);

  const primary = safety.face.primary;
  const box = primary ? pixelBox(primary.box, global.width, global.height) : null;
  // Sharpness + exposure are judged on the face (portrait bokeh and backlit scenes would fool
  // whole-image metrics); contrast stays global (flat / hazy photos).
  const faceRegion = box ? await faceRegionMetrics(bytes, box).catch(() => null) : null;
  const sharpness = faceRegion?.sharpness ?? global.sharpness;
  const brightness = faceRegion?.brightness ?? global.brightness;
  const faceAreaRatio = box ? (box.width * box.height) / Math.max(1, global.width * global.height) : undefined;

  const issues: PhotoIssue[] = [];
  const add = (template: IssueTemplate, severity: PhotoIssue["severity"]) => {
    if (!issues.some((i) => i.code === template.code)) issues.push({ ...template, severity });
  };
  const T = QUALITY_THRESHOLDS;

  if (Math.min(global.width, global.height) < T.minSide) add(ISSUES.too_small, "error");

  // Exposure problems also wreck the blur and contrast measurements: report the cause only.
  const exposureError = brightness < T.darkError || brightness > T.brightError;
  if (brightness < T.darkError) add(ISSUES.too_dark, "error");
  else if (brightness > T.brightError) add(ISSUES.too_bright, "error");
  else if (brightness < T.darkWarning) add(ISSUES.dim, "warning");
  else if (brightness > T.brightWarning) add(ISSUES.bright, "warning");

  if (!exposureError) {
    if (sharpness < T.blurError) add(ISSUES.blurry, "error");
    else if (sharpness < T.blurWarning) add(ISSUES.soft, "warning");
    if (global.contrast < T.lowContrastError) add(ISSUES.flat, "error");
    else if (global.contrast < T.lowContrastWarning) add(ISSUES.lowContrast, "warning");
  }

  if (box && faceAreaRatio !== undefined) {
    if (faceAreaRatio < T.minFaceAreaRatio) add(ISSUES.face_too_small, "error");
    else if (faceAreaRatio < T.smallFaceWarningRatio) add(ISSUES.faceSmallish, "warning");
    if (touchesEdge(box, global.width, global.height)) add(ISSUES.face_cut_off, "error");
  }
  const yaw = primary?.yaw;
  const pitch = primary?.pitch;
  if ((yaw !== undefined && Math.abs(yaw) > T.extremeYaw) || (pitch !== undefined && Math.abs(pitch) > T.extremePitch)) {
    add(ISSUES.extreme_angle, "warning");
  }

  if (isDuplicate(phash, existingPhashes)) add(ISSUES.duplicate, "error");

  for (const issue of safety.issues) {
    if (!issues.some((i) => i.code === issue.code)) issues.push({ ...issue });
  }
  // Errors first (safety before technical), then warnings.
  const ordered = [
    ...issues.filter((i) => i.severity === "error" && SAFETY_ISSUE_CODES.has(i.code)),
    ...issues.filter((i) => i.severity === "error" && !SAFETY_ISSUE_CODES.has(i.code)),
    ...issues.filter((i) => i.severity === "warning"),
  ];

  const metrics: PhotoQualityReport["metrics"] = {
    width: global.width,
    height: global.height,
    sharpness: round2(sharpness),
    brightness: round2(brightness),
    contrast: round2(global.contrast),
  };
  if (faceAreaRatio !== undefined) metrics.faceAreaRatio = Math.round(faceAreaRatio * 10_000) / 10_000;
  if (yaw !== undefined) metrics.yaw = yaw;
  if (pitch !== undefined) metrics.pitch = pitch;

  const hasError = ordered.some((i) => i.severity === "error");
  return {
    status: hasError ? "rejected" : "accepted",
    quality: { score: qualityScore(metrics, ordered), issues: ordered, metrics },
    face: safety.face,
    faceMatchScore: safety.faceMatchScore,
    ageEstimate: safety.ageEstimate,
    phash,
    safetyRejected: ordered.some((i) => i.severity === "error" && SAFETY_ISSUE_CODES.has(i.code)),
  };
}

/** 0-100: technical sub-scores (sharpness, exposure, contrast, face size) minus issue penalties. */
export function qualityScore(metrics: PhotoQualityReport["metrics"], issues: readonly PhotoIssue[]): number {
  const T = QUALITY_THRESHOLDS;
  const sharp = clamp01((metrics.sharpness - T.blurError) / (250 - T.blurError));
  const exposure = clamp01(1 - Math.abs(metrics.brightness - 135) / 110);
  const contrast = clamp01((metrics.contrast - T.lowContrastError) / (40 - T.lowContrastError));
  const face = metrics.faceAreaRatio === undefined ? 0 : clamp01((metrics.faceAreaRatio - T.minFaceAreaRatio) / (0.12 - T.minFaceAreaRatio));
  const base = 100 * (0.35 * sharp + 0.25 * exposure + 0.15 * contrast + 0.25 * face);

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  let score = base - 8 * warnings - 30 * errors;
  if (errors > 0) score = Math.min(score, 40);
  return Math.round(Math.min(100, Math.max(0, score)));
}

function isDuplicate(phash: string, existing: readonly (string | null | undefined)[]): boolean {
  return existing.some((other) => {
    if (!other || other.length !== phash.length) return false;
    try {
      return hammingDistance(phash, other) <= QUALITY_THRESHOLDS.duplicateHamming;
    } catch {
      return false;
    }
  });
}

/** Face boxes are pixels; accept relative (0..1) boxes from providers that report ratios. */
function pixelBox(box: FaceBox, width: number, height: number): FaceBox {
  const relative = box.width <= 1 && box.height <= 1 && box.x <= 1 && box.y <= 1;
  return relative ? { x: box.x * width, y: box.y * height, width: box.width * width, height: box.height * height } : box;
}

function touchesEdge(box: FaceBox, width: number, height: number): boolean {
  const mx = width * QUALITY_THRESHOLDS.edgeMargin;
  const my = height * QUALITY_THRESHOLDS.edgeMargin;
  return box.x <= mx || box.y <= my || box.x + box.width >= width - mx || box.y + box.height >= height - my;
}

async function faceRegionMetrics(bytes: Uint8Array, box: FaceBox): Promise<{ sharpness: number; brightness: number }> {
  const crop = await cropRegion(bytes, box, FACE_REGION_PAD);
  const resized = await sharp(crop)
    .resize({ width: FACE_REGION_SIDE, height: FACE_REGION_SIDE, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const m = await imageMetrics(new Uint8Array(resized));
  return { sharpness: m.sharpness, brightness: m.brightness };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
