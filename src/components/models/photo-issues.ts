import type { PhotoIssue, PhotoIssueCode, PhotoQualityReport } from "@/types/domain";

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
