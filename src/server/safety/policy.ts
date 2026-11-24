/**
 * Safety policy: thresholds, category mapping and user-facing messages.
 *
 * These values are NOT read from env and have hard floors, so editing src/config/app.ts cannot
 * weaken the adults-only rule below 18 (+2 years estimator margin). See docs/SAFETY.md.
 */
import { APP, TRAINING } from "@/config/app";
import type { PhotoIssue } from "@/types/domain";

/** Legal adult age. Hard floor: config can raise it, never lower it. */
const HARD_MIN_AGE = 18;
/** Age estimators are noisy; identity photos need this many extra years. Hard floor. */
const HARD_AGE_MARGIN = 2;
/** References / outputs get a smaller (but non-zero) estimator margin. Hard floor. */
const HARD_REFERENCE_MARGIN = 1;

/**
 * `max(floor, configured)` that fails CLOSED: a non-numeric / NaN / infinite config value (e.g.
 * `Number(process.env.UNSET)`) falls back to the floor instead of turning every age gate into
 * `age < NaN` (always false). Exported for tests.
 */
export function atLeast(floor: number, configured: unknown): number {
  return typeof configured === "number" && Number.isFinite(configured) ? Math.max(floor, configured) : floor;
}

const MIN_AGE = atLeast(HARD_MIN_AGE, TRAINING.minAge);

export const SAFETY_POLICY = Object.freeze({
  /** Consent selfie + training photos: every face's estimated age must be >= this. */
  minIdentityAge: MIN_AGE + atLeast(HARD_AGE_MARGIN, TRAINING.ageMargin),
  /** Uploaded reference/garment images: any face estimated below this (or of unknown age) is refused. */
  minReferenceAge: MIN_AGE + HARD_REFERENCE_MARGIN,
  /**
   * Generated images and video frames: any face estimated below this (or of unknown age) blocks the
   * output. Same margin as identity photos: outputs are derived from a verified adult identity.
   */
  minOutputAge: MIN_AGE + atLeast(HARD_AGE_MARGIN, TRAINING.ageMargin),
  /** Accepted photos required before training, per identity mode. */
  minPhotos: Object.freeze({ trained: atLeast(3, TRAINING.minPhotos), instant: 3 }),
  /** Video output moderation: frames per second sampled across the WHOLE clip (first + last frame always). */
  videoSampleFps: 1,
  /** Upper bound on sampled frames per video (longer clips are sampled evenly at a lower rate). */
  videoMaxSampleFrames: 32,
  /** Minimum frames sampled per video (first + last). */
  videoMinSampleFrames: 2,
  /** Longest excerpt of user text stored in moderation_events. */
  maxLoggedTextChars: 200,
});

export type IdentityMode = keyof typeof SAFETY_POLICY.minPhotos;

/** Canonical block categories, most severe first (decides which message the user sees). */
export const BLOCK_CATEGORIES = [
  "minors",
  "sexual",
  "public_figure",
  "violence_gore",
  "hate",
  "moderation_error",
  "other",
] as const;
export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];

/** Map a provider/rule category label ("sexual/minors", "Porn", "violence/graphic"...) to a canonical one. */
export function canonicalCategory(label: string): BlockCategory {
  const s = label.toLowerCase();
  if (/minor|child|underage|csam|teen/.test(s)) return "minors";
  if (/sex|nsfw|porn|nud|explicit|hentai|erotic|adult/.test(s)) return "sexual";
  if (/public.?figure|celebrit|famous/.test(s)) return "public_figure";
  if (/violen|gore|graphic|self.?harm|blood/.test(s)) return "violence_gore";
  if (/hate|harass|slur|extremis/.test(s)) return "hate";
  if (/moderation_error|unavailable/.test(s)) return "moderation_error";
  return "other";
}

/** Most severe canonical category among `labels` ("other" when empty). */
export function primaryCategory(labels: readonly string[]): BlockCategory {
  const canon = new Set(labels.map(canonicalCategory));
  return BLOCK_CATEGORIES.find((c) => canon.has(c)) ?? "other";
}

/** True when the labels contain a category that must always block, whatever `allowed` says. */
export function hasHardBlockCategory(labels: readonly string[]): boolean {
  return labels.some((l) => {
    const c = canonicalCategory(l);
    return c === "minors" || c === "sexual";
  });
}

const TEXT_MESSAGES: Record<BlockCategory, string> = {
  minors: `${APP.name} is for adults only, so requests can't mention or depict children or anyone under 18.`,
  sexual: "Sexual or suggestive content isn't allowed. Try describing the outfit, setting or mood instead.",
  public_figure:
    "We can't create images of real public figures or celebrities. Describe a style, outfit or setting instead.",
  violence_gore: "Graphic violence and gore aren't allowed. Try a different scene.",
  hate: "Hateful or harassing content isn't allowed.",
  moderation_error: "We couldn't safety-check this request right now, so it wasn't run. Please try again in a moment.",
  other: "This request was blocked by our safety rules. Try rephrasing it.",
};

const IMAGE_MESSAGES: Record<BlockCategory, string> = {
  minors: `This image appears to show someone under 18. ${APP.name} is for adults only.`,
  sexual: "This image was flagged as sexual or suggestive and can't be used.",
  public_figure: "This image appears to show a public figure. Use photos of yourself or generic references instead.",
  violence_gore: "This image shows graphic content and can't be used.",
  hate: "This image contains hateful content and can't be used.",
  moderation_error: "We couldn't safety-check this image right now. Please try again in a moment.",
  other: "This image was blocked by our safety rules.",
};

export function textBlockedMessage(categories: readonly string[]): string {
  return TEXT_MESSAGES[primaryCategory(categories)];
}

export function imageBlockedMessage(categories: readonly string[]): string {
  return IMAGE_MESSAGES[primaryCategory(categories)];
}

export const ADULTS_ONLY_MESSAGE = `${APP.name} is for adults only. You must be 18 or older to create a model.`;
export const MULTI_PERSON_CONSENT_MESSAGE =
  "Using someone else's model needs their consent. Ask them to accept your invite and share their model with you first.";

/** Plain-language training-photo issues (merged into the quality report). */
export const PHOTO_ISSUES = {
  no_face: {
    code: "no_face",
    severity: "error",
    message: "We couldn't find a face in this photo.",
    fix: "Use a photo where your face is clearly visible, well lit and not covered.",
  },
  multiple_faces: {
    code: "multiple_faces",
    severity: "error",
    message: "More than one person is in this photo.",
    fix: "Use photos where you're alone, or crop the other people out.",
  },
  face_mismatch: {
    code: "face_mismatch",
    severity: "error",
    message: "This doesn't look like the person in your consent selfie.",
    fix: "Only upload photos of yourself.",
  },
  underage: {
    code: "underage",
    severity: "error",
    message: "This photo looks like it may show someone under 18.",
    fix: `${APP.name} is for adults only. Use recent photos of yourself as an adult (no childhood photos).`,
  },
  age_unknown: {
    code: "underage",
    severity: "error",
    message: "We couldn't confirm that the person in this photo is an adult.",
    fix: "Use a clear, recent, front-facing photo of yourself in good light.",
  },
  nsfw: {
    code: "nsfw",
    severity: "error",
    message: "This photo was flagged by our safety check.",
    fix: "Use everyday photos where you're fully clothed.",
  },
  check_failed: {
    code: "unreadable",
    severity: "error",
    message: "We couldn't run the safety check on this photo.",
    fix: "Please try uploading it again in a moment.",
  },
} as const satisfies Record<string, PhotoIssue>;
