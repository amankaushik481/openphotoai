/**
 * Active-liveness test frames for the mock face provider: one camera frame per head-pose step, of
 * the same mock identity as the frontal selfie, carrying explicit pose marker cells (see
 * src/providers/mock/markers.ts). Each frame is built on a different fixture photo, so frames are
 * never near-duplicates.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { LivenessStep } from "@/lib/liveness";
import { createMockFaceProvider } from "@/providers/mock/face";
import { decodeMarker, encodeMarker, type Marker, type MarkerPose } from "@/providers/mock/markers";

const SELFIES = path.resolve(process.cwd(), "tests/fixtures/selfies");
/** Fixture photos the step frames are painted on (distinct from the usual frontal selfies). */
const FRAME_BASES = ["alice-07", "alice-08", "alice-09", "alice-10"] as const;
/** How far each step moves the head, relative to the frontal frame (well above the thresholds). */
const STEP_DELTA: Record<LivenessStep, MarkerPose> = {
  turn_left: { yaw: -25, pitch: 0 },
  turn_right: { yaw: 25, pitch: 0 },
  look_up: { yaw: 0, pitch: 20 },
  look_down: { yaw: 0, pitch: -20 },
};

const face = createMockFaceProvider();

export interface LivenessFrameOptions {
  /** Override the identity / age of the step frames (e.g. a different person mid-check). */
  marker?: Partial<Marker>;
  /** Override the pose delta of a step (e.g. turning the wrong way). */
  deltas?: Partial<Record<LivenessStep, MarkerPose>>;
  /** Use this base photo for every frame (e.g. to produce near-duplicates). */
  base?: Uint8Array;
}

/** One JPEG frame per step that passes the liveness check against `frontal` (unless `opts` says otherwise). */
export async function livenessFrames(
  frontal: Uint8Array,
  steps: readonly LivenessStep[],
  opts: LivenessFrameOptions = {},
): Promise<Uint8Array<ArrayBuffer>[]> {
  const marker = (await decodeMarker(frontal)) ?? { identity: "default", age: 30, faces: 1, nsfw: false, blurry: false, publicFigure: false };
  const main = (await face.analyze(frontal)).faces[0];
  const origin = { yaw: main?.yaw ?? 0, pitch: main?.pitch ?? 0 };
  return Promise.all(
    steps.map(async (step, i) => {
      const base = opts.base ?? readFileSync(path.join(SELFIES, `${FRAME_BASES[i % FRAME_BASES.length]}.jpg`));
      const delta = opts.deltas?.[step] ?? STEP_DELTA[step];
      const pose = { yaw: origin.yaw + delta.yaw, pitch: origin.pitch + delta.pitch };
      const stamped = await encodeMarker(sharp(base), { ...marker, ...opts.marker, pose });
      return Uint8Array.from(await stamped.jpeg({ quality: 90 }).toBuffer());
    }),
  );
}

/** Append the frames to a consent form under the `liveness` field. */
export function appendLivenessFrames(form: FormData, frames: readonly Uint8Array<ArrayBuffer>[]): FormData {
  frames.forEach((frame, i) => form.append("liveness", new Blob([frame], { type: "image/jpeg" }), `liveness-${i + 1}.jpg`));
  return form;
}
