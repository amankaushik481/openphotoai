/** Output classifiers for generated images and videos. Fail closed: any error means "blocked". */
import { extractVideoFrames } from "@/server/images/process";
import type { ModerationSnapshot } from "@/types/domain";
import type { SafetyContext } from "./context";
import { errorMessage, hashBytes, recordBlock } from "./events";
import { SAFETY_POLICY } from "./policy";
import { failedSnapshot, moderateImage, moderationProviderName, snapshot, type Classification } from "./providers";

/** Classify a generated image. Blocked outputs must be discarded by the caller. */
export async function checkOutputImage(bytes: Uint8Array, ctx: SafetyContext): Promise<ModerationSnapshot> {
  const base = { media: "image", sha256: hashBytes(bytes), bytes: bytes.byteLength };
  let c: Classification;
  try {
    c = await moderateImage(bytes);
  } catch (err) {
    const failed = failedSnapshot(await moderationProviderName());
    await recordBlock("output_blocked", ctx, { ...base, categories: failed.categories, error: errorMessage(err) });
    return failed;
  }
  const result = snapshot(c);
  if (c.blocked) {
    await recordBlock("output_blocked", ctx, {
      ...base,
      provider: c.providerName,
      categories: c.categories,
      scores: c.result.scores ?? {},
      reason: c.result.reason ?? null,
    });
  }
  return result;
}

/** Classify a generated video by sampling frames; any blocked frame blocks the video. Fails closed. */
export async function checkOutputVideo(bytes: Uint8Array, ctx: SafetyContext): Promise<ModerationSnapshot> {
  const base = { media: "video", sha256: hashBytes(bytes), bytes: bytes.byteLength };
  const frameResults: Classification[] = [];
  try {
    const { frames } = await extractVideoFrames(bytes, SAFETY_POLICY.videoSampleFrames);
    if (frames.length === 0) throw new Error("no frames could be extracted from the video");
    // Sequential: local classifiers are CPU-bound and frames are large.
    for (const frame of frames) frameResults.push(await moderateImage(frame));
  } catch (err) {
    const failed = failedSnapshot(await moderationProviderName());
    await recordBlock("output_blocked", ctx, { ...base, categories: failed.categories, error: errorMessage(err) });
    return failed;
  }

  const blockedFrames = frameResults.flatMap((r, i) => (r.blocked ? [i] : []));
  const categories = [...new Set(frameResults.filter((r) => r.blocked).flatMap((r) => r.categories))];
  const providerName = frameResults[0]?.providerName ?? "unknown";
  const blocked = blockedFrames.length > 0;
  if (blocked) {
    await recordBlock("output_blocked", ctx, {
      ...base,
      provider: providerName,
      categories,
      framesChecked: frameResults.length,
      blockedFrames,
    });
  }
  return snapshot({ blocked, categories, providerName });
}
