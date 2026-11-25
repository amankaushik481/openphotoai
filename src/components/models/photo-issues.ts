import type { PhotoIssue, PhotoIssueCode, PhotoQualityReport, ReadinessDTO } from "@/types/domain";

/** Short chip labels for photo issues (the full message + fix come from the server). */
export const ISSUE_LABELS: Record<PhotoIssueCode, string> = {
  unreadable: "Check failed",
  too_small: "Too small",
  blurry: "Blurry",
  too_dark: "Too dark",
  too_bright: "Too bright",
  low_contrast: "Flat light",
  no_face: "No face",
  multiple_faces: "Other people",
  face_too_small: "Face too small",
  face_cut_off: "Face cut off",
  extreme_angle: "Big head turn",
  duplicate: "Duplicate",
  face_mismatch: "Not you",
  underage: "Under 18?",
  nsfw: "Flagged",
};

/** Error details of a rejected (not stored) upload: `{ issue, quality, stored: false }`. */
export function rejectionIssues(details: unknown): PhotoIssue[] | null {
  if (!details || typeof details !== "object") return null;
  const quality = (details as { quality?: PhotoQualityReport }).quality;
  return Array.isArray(quality?.issues) ? quality.issues : null;
}

/** Mirrors VARIETY_TARGETS.trained in src/server/models/readiness.ts (display only). */
export const POSE_GOALS = { frontal: 4, left: 2, right: 2, up: 1, down: 1 } as const;

export const POSE_LABELS: Record<keyof typeof POSE_GOALS, string> = {
  frontal: "Facing camera",
  left: "Turned left",
  right: "Turned right",
  up: "Looking up",
  down: "Looking down",
};

type ModeReadiness = Pick<ReadinessDTO, "accepted" | "minRequired" | "canTrain" | "blockers">;

export interface PhotoStepStatus {
  /** The wizard may move on to choosing Instant / Trained. */
  canContinue: boolean;
  /** Short status next to the counter ("3 more for Instant", "Checking 2 photos…"). */
  detail: string;
  /** Why Continue is disabled (null when it isn't). */
  reason: string | null;
}

const photoCount = (n: number) => `${n} ${n === 1 ? "photo" : "photos"}`;

/**
 * Where the user stands on the photos step. Continue needs Instant readiness *and* no upload still
 * in flight: moving on early would start the model without the photos that are still on their way.
 */
export function photoStepStatus(
  readiness: { instant: ModeReadiness; trained: ModeReadiness },
  pendingUploads: number,
): PhotoStepStatus {
  const { instant, trained } = readiness;
  const toInstant = Math.max(0, instant.minRequired - instant.accepted);
  const toTrained = Math.max(0, trained.minRequired - trained.accepted);

  let detail: string;
  if (pendingUploads > 0) detail = `Checking ${photoCount(pendingUploads)}…`;
  else if (toInstant > 0) detail = `${toInstant} more for Instant`;
  else if (!instant.canTrain) detail = instant.blockers[0] ?? "Not ready yet";
  else if (toTrained > 0) detail = `Instant ready · ${toTrained} more for Trained`;
  else if (!trained.canTrain) detail = `Instant ready · ${trained.blockers[0] ?? "Trained isn't ready yet"}`;
  else detail = "Ready for Instant or Trained";

  let reason: string | null = null;
  if (!instant.canTrain) {
    reason =
      toInstant > 0
        ? `Add at least ${toInstant} more good ${toInstant === 1 ? "photo" : "photos"} to continue.`
        : (instant.blockers[0] ?? "Add a few more good photos to continue.");
  } else if (pendingUploads > 0) {
    reason = `Wait for ${photoCount(pendingUploads)} to finish uploading.`;
  }
  return { canContinue: reason === null, detail, reason };
}
