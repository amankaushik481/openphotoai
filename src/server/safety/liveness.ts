/**
 * Active liveness for the consent selfie (head-pose challenge).
 *
 * The capture challenge carries a random sequence of head-pose steps (e.g. "turn left", "look up").
 * The in-app camera captures one frame per step plus the frontal selfie, and all frames are posted
 * together inside the challenge's 5-minute window. The server then requires:
 *   - every frame shows exactly one face, of the same person as the frontal selfie
 *     (embedding similarity >= the face provider's match threshold);
 *   - no two frames are near-duplicates (dHash distance), so one photo can't be replayed;
 *   - whenever the face provider reports head pose, each step's yaw/pitch moved by at least the
 *     threshold relative to the frontal frame, in the requested direction (or, for providers whose
 *     sign convention is unverified, by that magnitude, with opposite signs for opposite steps).
 *
 * This raises the bar a lot over "post any JPEG" (a scraped photo can't answer a random pose
 * sequence), but it is NOT certified liveness / presentation-attack detection: a determined attacker
 * with a video of the victim turning their head, or a good 3D/deepfake puppet, can still pass. For
 * high assurance use a certified service (e.g. AWS Rekognition Face Liveness). See docs/SAFETY.md.
 */
import { randomInt } from "node:crypto";
import type { DetectedFace } from "@/providers/types";
import { hammingDistance, perceptualHash } from "@/server/images/process";
import { AppError, errors } from "@/server/http";
import { LIVENESS_STEP_COUNT, LIVENESS_STEPS, type LivenessStep } from "@/lib/liveness";
import type { SafetyContext } from "./context";
import { cosineSimilarity, isValidEmbedding } from "./embeddings";
import { errorMessage, recordBlock } from "./events";
import { isFiniteNumber } from "./faces";
import { ADULTS_ONLY_MESSAGE, SAFETY_POLICY } from "./policy";
import { analyzeFaces, faceProviderName } from "./providers";

export { LIVENESS_STEPS, type LivenessStep } from "@/lib/liveness";

export const LIVENESS_POLICY = Object.freeze({
  /** Head-pose steps per challenge. */
  steps: LIVENESS_STEP_COUNT,
  /** Minimum yaw change (degrees) vs. the frontal frame for a turn step. */
  minYawDelta: 12,
  /** Minimum pitch change (degrees) vs. the frontal frame for a tilt step. */
  minPitchDelta: 8,
  /** Frames whose 64-bit dHash differ by fewer bits than this are near-duplicates. */
  minFrameDistance: 2,
});

/**
 * Pose sign conventions we have verified per face provider (`DetectedFace` contract: negative yaw =
 * subject turned to their own left, positive pitch = looking up). Unverified axes are checked on
 * magnitude only (docs/SAFETY_PROVIDERS.md: local yaw verified on 153 samples; local pitch and
 * Rekognition signs are unverified).
 */
const DIRECTION_VERIFIED: Readonly<Record<string, { yaw: boolean; pitch: boolean }>> = {
  mock: { yaw: true, pitch: true },
  local: { yaw: true, pitch: false },
};

const STEP_AXIS: Record<LivenessStep, { axis: "yaw" | "pitch"; sign: 1 | -1 }> = {
  turn_left: { axis: "yaw", sign: -1 },
  turn_right: { axis: "yaw", sign: 1 },
  look_up: { axis: "pitch", sign: 1 },
  look_down: { axis: "pitch", sign: -1 },
};

const MESSAGES = {
  frames: "The head-movement check didn't finish. Follow the on-screen prompts and try again.",
  noFace: "We lost your face during the head-movement check. Keep your face inside the oval and try again.",
  multipleFaces: "Only you should be in the frame during the check. Make sure no one else is visible and try again.",
  identity: "The person in the camera changed during the check. Only the person creating the model can take it.",
  duplicate: "We couldn't see you move. Follow each prompt and turn or tilt your head slightly when asked.",
  pose: "We couldn't confirm the head movements. Turn or tilt your head slightly in the direction shown, then try again.",
  checkFailed: "We couldn't check your selfie right now. Please try again in a moment.",
} as const;

/** A random, ordered sequence of distinct head-pose steps. */
export function pickLivenessChallenge(count: number = LIVENESS_POLICY.steps): LivenessStep[] {
  const pool = [...LIVENESS_STEPS];
  const steps: LivenessStep[] = [];
  while (steps.length < Math.min(count, LIVENESS_STEPS.length)) steps.push(pool.splice(randomInt(pool.length), 1)[0]!);
  return steps;
}

export interface LivenessFrontal {
  bytes: Uint8Array;
  /** The verified consent embedding of the frontal frame. */
  embedding: number[];
  yaw?: number;
  pitch?: number;
}

export interface LivenessFrameEvidence {
  step: LivenessStep;
  similarity: number;
  yawDelta: number | null;
  pitchDelta: number | null;
}

export interface LivenessEvidence {
  method: "active_head_pose";
  challenge: LivenessStep[];
  faceProvider: string;
  /** True when the provider reported head pose and every step's movement was verified. */
  poseVerified: boolean;
  /** Axes whose direction (not only magnitude) was checked. */
  directionChecked: { yaw: boolean; pitch: boolean };
  thresholds: { minYawDelta: number; minPitchDelta: number; minFrameDistance: number; match: number };
  /** Smallest dHash distance between any two submitted frames. */
  minFrameDistance: number;
  frames: LivenessFrameEvidence[];
}

/**
 * Verify the challenge frames against the frontal (already verified) consent selfie. Throws
 * AppError("consent_required") on a failed check (after recording "consent_failed"), and
 * AppError("content_blocked") when a provider fails (fail closed) or a frame shows a minor.
 */
export async function verifyLiveness(
  frontal: LivenessFrontal,
  frames: readonly Uint8Array[],
  challenge: readonly LivenessStep[],
  ctx: SafetyContext,
): Promise<LivenessEvidence> {
  const base = { stage: "liveness", challenge: [...challenge], frames: frames.length };
  const fail = async (reason: string, error: AppError, extra: Record<string, unknown> = {}): Promise<never> => {
    await recordBlock("consent_failed", ctx, { ...base, reason, ...extra });
    throw error;
  };
  const required = (message: string) => new AppError("consent_required", message);

  if (challenge.length === 0 || frames.length !== challenge.length) {
    return fail("liveness_frames_missing", required(MESSAGES.frames), { expected: challenge.length });
  }

  let analyzed: { faces: DetectedFace[]; matchThreshold: number }[];
  let hashes: string[];
  let provider: string;
  try {
    [analyzed, hashes, provider] = await Promise.all([
      Promise.all(frames.map((f) => analyzeFaces(f))),
      Promise.all([frontal.bytes, ...frames].map((f) => perceptualHash(f))),
      faceProviderName(),
    ]);
  } catch (err) {
    return fail("liveness_check_error", errors.contentBlocked(MESSAGES.checkFailed, { categories: ["moderation_error"] }), {
      error: errorMessage(err),
    });
  }

  const faces: DetectedFace[] = [];
  for (const [i, { faces: found }] of analyzed.entries()) {
    if (found.length === 0) return fail("liveness_no_face", required(MESSAGES.noFace), { frame: i });
    if (found.length > 1) return fail("liveness_multiple_faces", required(MESSAGES.multipleFaces), { frame: i, faces: found.length });
    faces.push(found[0]!);
  }

  const underage = faces.findIndex((f) => isFiniteNumber(f.age) && !(f.age >= SAFETY_POLICY.minIdentityAge));
  if (underage >= 0) {
    await recordBlock("underage", ctx, { ...base, frame: underage, age: faces[underage]!.age, minAge: SAFETY_POLICY.minIdentityAge });
    throw errors.contentBlocked(ADULTS_ONLY_MESSAGE, { categories: ["minors"] });
  }

  const threshold = analyzed[0]!.matchThreshold;
  const similarities = faces.map((f) => similarity(frontal.embedding, f.embedding));
  const strangers = similarities.flatMap((s, i) => (s === null || !(s >= threshold) ? [i] : []));
  if (strangers.length > 0) {
    return fail("liveness_identity_mismatch", required(MESSAGES.identity), { framesMismatched: strangers, similarities, threshold });
  }

  const minDistance = smallestPairDistance(hashes);
  if (minDistance < LIVENESS_POLICY.minFrameDistance) {
    return fail("liveness_duplicate_frames", required(MESSAGES.duplicate), { minDistance });
  }

  const verified = DIRECTION_VERIFIED[provider] ?? { yaw: false, pitch: false };
  const pose = measurePose(frontal, faces, challenge, verified);
  const evidence: LivenessEvidence = {
    method: "active_head_pose",
    challenge: [...challenge],
    faceProvider: provider,
    poseVerified: pose.reported,
    directionChecked: verified,
    thresholds: {
      minYawDelta: LIVENESS_POLICY.minYawDelta,
      minPitchDelta: LIVENESS_POLICY.minPitchDelta,
      minFrameDistance: LIVENESS_POLICY.minFrameDistance,
      match: threshold,
    },
    minFrameDistance: minDistance,
    frames: challenge.map((step, i) => ({
      step,
      similarity: round2(similarities[i]!),
      yawDelta: pose.deltas[i]?.yaw ?? null,
      pitchDelta: pose.deltas[i]?.pitch ?? null,
    })),
  };
  if (!pose.ok) {
    return fail(`liveness_${pose.reason}`, required(MESSAGES.pose), { measured: evidence.frames, failedSteps: pose.failed });
  }
  return evidence;
}

/* ───────────── pose ───────────── */

interface PoseResult {
  ok: boolean;
  reported: boolean;
  reason?: "pose_unmeasurable" | "pose_not_followed";
  failed: number[];
  deltas: { yaw: number; pitch: number }[];
}

/**
 * Pose is enforced whenever the provider reports it: all frames must then carry yaw + pitch (a
 * provider that measures some frames but not others fails closed). No pose at all → not enforced
 * (identity + distinct-frame checks still apply) and the evidence says so.
 */
function measurePose(
  frontal: Pick<LivenessFrontal, "yaw" | "pitch">,
  faces: readonly DetectedFace[],
  challenge: readonly LivenessStep[],
  verified: { yaw: boolean; pitch: boolean },
): PoseResult {
  const all = [frontal, ...faces];
  const measured = all.filter((f) => isFiniteNumber(f.yaw) && isFiniteNumber(f.pitch)).length;
  if (measured === 0) return { ok: true, reported: false, failed: [], deltas: [] };
  if (measured !== all.length) return { ok: false, reported: true, reason: "pose_unmeasurable", failed: [], deltas: [] };

  const deltas = faces.map((f) => ({ yaw: round1(f.yaw! - frontal.yaw!), pitch: round1(f.pitch! - frontal.pitch!) }));
  const failed: number[] = [];
  for (const [i, step] of challenge.entries()) {
    const { axis, sign } = STEP_AXIS[step];
    const delta = deltas[i]![axis];
    const min = axis === "yaw" ? LIVENESS_POLICY.minYawDelta : LIVENESS_POLICY.minPitchDelta;
    const moved = verified[axis] ? delta * sign >= min : Math.abs(delta) >= min;
    if (!moved) failed.push(i);
  }
  // Unverified sign convention: opposite steps on the same axis must still move in opposite directions.
  for (const axis of ["yaw", "pitch"] as const) {
    if (verified[axis]) continue;
    const idx = challenge.flatMap((s, i) => (STEP_AXIS[s].axis === axis ? [i] : []));
    if (idx.length === 2 && STEP_AXIS[challenge[idx[0]!]!].sign !== STEP_AXIS[challenge[idx[1]!]!].sign) {
      if (Math.sign(deltas[idx[0]!]![axis]) === Math.sign(deltas[idx[1]!]![axis])) failed.push(...idx);
    }
  }
  const unique = [...new Set(failed)].sort((a, b) => a - b);
  return { ok: unique.length === 0, reported: true, reason: unique.length ? "pose_not_followed" : undefined, failed: unique, deltas };
}

/* ───────────── helpers ───────────── */

function similarity(a: number[], b: number[]): number | null {
  if (!isValidEmbedding(a) || !isValidEmbedding(b) || a.length !== b.length) return null;
  try {
    return cosineSimilarity(a, b);
  } catch {
    return null;
  }
}

function smallestPairDistance(hashes: readonly string[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < hashes.length; i++) {
    for (let j = i + 1; j < hashes.length; j++) min = Math.min(min, hammingDistance(hashes[i]!, hashes[j]!));
  }
  return Number.isFinite(min) ? min : 0;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
