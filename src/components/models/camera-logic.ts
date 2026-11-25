/**
 * Pure helpers behind the consent camera (`camera-capture.tsx`): error classification, the copy for
 * each failure, and which actions the review screen offers. No React, no DOM: unit-tested.
 */
import { LIVENESS_STEP_COUNT } from "@/lib/liveness";

export type CameraErrorKind = "denied" | "not_found" | "busy" | "unsupported" | "interrupted" | "unknown";

/** What went wrong and how to fix it, per camera failure. */
export const CAMERA_ERRORS: Record<CameraErrorKind, { title: string; body: string }> = {
  denied: {
    title: "Camera access is blocked",
    body: "Allow the camera for this site in your browser settings (often the camera or lock icon in the address bar), then tap Try again.",
  },
  not_found: {
    title: "No camera found",
    body: "We couldn't find a camera on this device. Continue on your phone, or on a computer with a webcam.",
  },
  busy: {
    title: "Your camera is busy",
    body: "Another app (a video call, for example) is using the camera. Close it, then tap Try again.",
  },
  unsupported: {
    title: "This browser can't open the camera",
    body: "Use an up-to-date browser on a secure (https) page, or continue on your phone.",
  },
  interrupted: {
    title: "The camera stopped",
    body: "The camera turned off, maybe because the screen locked or another app took it. Tap Try again to restart it.",
  },
  unknown: {
    title: "We couldn't start the camera",
    body: "Please try again. If it keeps failing, continue on your phone.",
  },
};

/** Map a `getUserMedia` failure to a kind we can explain. */
export function cameraErrorKind(err: unknown): CameraErrorKind {
  const name =
    typeof err === "object" && err !== null && "name" in err && typeof (err as { name: unknown }).name === "string"
      ? (err as { name: string }).name
      : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "not_found";
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") return "busy";
  if (name === "TypeError" || name === "NotSupportedError") return "unsupported";
  return "unknown";
}

/** Errors that a phone (or another device) can solve: offer the "continue on your phone" link. */
export function suggestOtherDevice(kind: CameraErrorKind): boolean {
  return kind === "not_found" || kind === "unsupported" || kind === "unknown";
}

/**
 * Buttons on the review screen. A capture is single use: its token is consumed by the server as
 * soon as the selfie is submitted (and a failed liveness check needs new head-movement steps), so
 * after a failed submission the only way forward is a retake. Offering "Use this selfie" again would
 * just fail with a confusing "please retake" message.
 */
export function reviewActions(state: { failed: boolean }): {
  confirm: boolean;
  /** The highlighted (brand) action. */
  primary: "confirm" | "retake";
} {
  if (state.failed) return { confirm: false, primary: "retake" };
  return { confirm: true, primary: "confirm" };
}

export type CaptureStage = "selfie" | "moves" | "check";

/** The three stages shown under the viewfinder: frontal selfie, head moves, server check. */
export const CAPTURE_STAGES: readonly { id: CaptureStage; label: string }[] = [
  { id: "selfie", label: "Selfie" },
  { id: "moves", label: `${LIVENESS_STEP_COUNT} head moves` },
  { id: "check", label: "Check" },
];

/** Which stage a camera phase belongs to (`null` before the capture starts). */
export function captureStage(phase: string): CaptureStage | null {
  switch (phase) {
    case "countdown":
      return "selfie";
    case "step":
      return "moves";
    case "review":
    case "submitting":
      return "check";
    default:
      return null;
  }
}
