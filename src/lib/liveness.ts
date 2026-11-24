/**
 * Active-liveness head-pose steps for the consent selfie. Client-safe (no server imports): the
 * camera UI shows the prompts, the server (src/server/safety/liveness.ts) verifies the frames.
 *
 * Directions are from the subject's point of view: "left" is the person's own left. The camera
 * preview is mirrored, so turning to your own left also moves your face to the left of the screen.
 */
export const LIVENESS_STEPS = ["turn_left", "turn_right", "look_up", "look_down"] as const;
export type LivenessStep = (typeof LIVENESS_STEPS)[number];

/** Head-pose steps per consent challenge (each captured as one frame, plus a frontal frame). */
export const LIVENESS_STEP_COUNT = 2;

/** Multipart field carrying the challenge frames, in challenge order. */
export const LIVENESS_FRAME_FIELD = "liveness";

/** On-screen instruction per step (short: shown over the camera preview and announced). */
export const LIVENESS_PROMPTS: Readonly<Record<LivenessStep, string>> = Object.freeze({
  turn_left: "Turn your head slightly to your left",
  turn_right: "Turn your head slightly to your right",
  look_up: "Tilt your head slightly up",
  look_down: "Tilt your head slightly down",
});

export function isLivenessStep(value: unknown): value is LivenessStep {
  return typeof value === "string" && (LIVENESS_STEPS as readonly string[]).includes(value);
}
