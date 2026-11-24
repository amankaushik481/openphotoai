/**
 * Output classifiers for generated images and videos. Fail closed: any error means "blocked".
 *
 * Two gates run on every output (and on every sampled video frame):
 *   1. the moderation classifier (sexual content etc.);
 *   2. an age gate: every face must be estimated at least SAFETY_POLICY.minOutputAge (18 + margin);
 *      a face of unknown age, or a face-provider error, blocks (prompts that point at minors are
 *      easy to phrase around the text filter, so the output itself is checked).
 */
import type { DetectedFace } from "@/providers/types";
import { extractSampleFrames } from "@/server/images/video";
import type { ModerationSnapshot } from "@/types/domain";
import type { SafetyContext } from "./context";
import { errorMessage, hashBytes, recordBlock } from "./events";
import { facesUnder } from "./faces";
import { SAFETY_POLICY } from "./policy";
import { analyzeFaces, failedSnapshot, moderateImage, moderationProviderName, snapshot, type Classification } from "./providers";

const MINORS = "minors";

/** Classification of one image: classifier verdict + face age gate. */
async function classifyFrame(bytes: Uint8Array): Promise<{ c: Classification; underage: DetectedFace[] }> {
  const c = await moderateImage(bytes);
  if (c.blocked) return { c, underage: [] };
  const { faces } = await analyzeFaces(bytes);
  return { c, underage: facesUnder(faces, SAFETY_POLICY.minOutputAge) };
}

/** Classify a generated image. Blocked outputs must be discarded by the caller. */
export async function checkOutputImage(bytes: Uint8Array, ctx: SafetyContext): Promise<ModerationSnapshot> {
  const base = { media: "image", sha256: hashBytes(bytes), bytes: bytes.byteLength };
  let result: Awaited<ReturnType<typeof classifyFrame>>;
  try {
    result = await classifyFrame(bytes);
  } catch (err) {
    const failed = failedSnapshot(await moderationProviderName());
    await recordBlock("output_blocked", ctx, { ...base, categories: failed.categories, error: errorMessage(err) });
    return failed;
  }
  const { c, underage } = result;
  if (c.blocked) {
    await recordBlock("output_blocked", ctx, {
      ...base,
      provider: c.providerName,
      categories: c.categories,
      scores: c.result.scores ?? {},
      reason: c.result.reason ?? null,
    });
    return snapshot(c);
  }
  if (underage.length > 0) {
    await recordBlock("output_blocked", ctx, {
      ...base,
      provider: c.providerName,
      categories: [MINORS],
      reason: "underage",
      ages: underage.map((f) => f.age ?? null),
      minAge: SAFETY_POLICY.minOutputAge,
    });
    return snapshot({ blocked: true, categories: [MINORS], providerName: c.providerName });
  }
  return snapshot(c);
}

/**
 * Classify a generated video by sampling frames across the whole clip (>= 1 per second, always the
 * first and the last frame); any blocked frame blocks the video. Fails closed (unreadable video or a
 * sample that doesn't decode = blocked).
 */
export async function checkOutputVideo(bytes: Uint8Array, ctx: SafetyContext): Promise<ModerationSnapshot> {
  const base = { media: "video", sha256: hashBytes(bytes), bytes: bytes.byteLength };
  const results: { c: Classification; underage: DetectedFace[] }[] = [];
  try {
    const { frames } = await extractSampleFrames(bytes, {
      fps: SAFETY_POLICY.videoSampleFps,
      maxFrames: SAFETY_POLICY.videoMaxSampleFrames,
    });
    if (frames.length < SAFETY_POLICY.videoMinSampleFrames) throw new Error("not enough frames could be extracted from the video");
    // Sequential: local classifiers are CPU-bound and frames are large. Stop at the first blocked frame.
    for (const frame of frames) {
      const r = await classifyFrame(frame);
      results.push(r);
      if (r.c.blocked || r.underage.length > 0) break;
    }
  } catch (err) {
    const failed = failedSnapshot(await moderationProviderName());
    await recordBlock("output_blocked", ctx, { ...base, categories: failed.categories, error: errorMessage(err) });
    return failed;
  }

  const blockedFrames = results.flatMap((r, i) => (r.c.blocked || r.underage.length > 0 ? [i] : []));
  const categories = [
    ...new Set(results.flatMap((r) => [...(r.c.blocked ? r.c.categories : []), ...(r.underage.length > 0 ? [MINORS] : [])])),
  ];
  const providerName = results[0]?.c.providerName ?? "unknown";
  const blocked = blockedFrames.length > 0;
  if (blocked) {
    const ages = results.flatMap((r) => r.underage.map((f) => f.age ?? null));
    await recordBlock("output_blocked", ctx, {
      ...base,
      provider: providerName,
      categories,
      framesChecked: results.length,
      blockedFrames,
      ...(ages.length > 0 ? { reason: "underage", ages, minAge: SAFETY_POLICY.minOutputAge } : {}),
    });
  }
  return snapshot({ blocked, categories, providerName });
}
