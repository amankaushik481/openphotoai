/**
 * Media helpers. CONTRACT FILE (owner: job-engine workstream).
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { APP } from "@/config/app";
import { shouldWatermark } from "@/config/plans";
import { db } from "@/db";
import { identityModels, media, uploads, user as userTable } from "@/db/schema";
import type { JobRow, MediaRow, NewMediaRow, UploadRow } from "@/db/types";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { getAIProvider, getImageProvider } from "@/providers/registry";
import type { AsyncAIProvider, ProviderImage, ProviderVideo } from "@/providers/types";
import { refundJob } from "@/server/credits/ledger";
import { errors } from "@/server/http";
import {
  applyAiLabel,
  applyWatermark,
  extractVideoFrames,
  imageMetrics,
  makeThumbnail,
} from "@/server/images/process";
import { checkOutputImage, checkOutputVideo, likenessScore, recordModerationEvent } from "@/server/safety";
import { getStorage, signedUrl, storageKeys } from "@/server/storage";
import { expectedOutputs } from "@/server/jobs/costs";
import type { MediaDTO, ModerationSnapshot } from "@/types/domain";
import { buildScores, pickBestShots, qualityFromMetrics } from "./scoring";

/** Provider input URLs must outlive queueing + processing at the provider. */
const PROVIDER_INPUT_URL_TTL_SEC = 2 * 60 * 60;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "application/zip": "zip",
};
const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime]),
);

export function extForMime(mime: string): string {
  return EXT_BY_MIME[mime.split(";")[0]!.trim().toLowerCase()] ?? "bin";
}

export function mimeForKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext === "jpeg" ? "jpg" : ext] ?? "application/octet-stream";
}

function downloadName(row: MediaRow): string {
  const brand = APP.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "media";
  return `${brand}-${row.id}.${extForMime(row.mimeType)}`;
}

/** DTO with signed URLs (url/thumbUrl/downloadUrl). */
export async function toMediaDTO(row: MediaRow): Promise<MediaDTO> {
  const [url, thumbUrl, downloadUrl] = await Promise.all([
    signedUrl(row.storageKey),
    row.thumbKey ? signedUrl(row.thumbKey) : Promise.resolve<string | null>(null),
    signedUrl(row.storageKey, { downloadName: downloadName(row) }),
  ]);
  return {
    id: row.id,
    kind: row.kind,
    url,
    thumbUrl: thumbUrl ?? url,
    downloadUrl,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    durationSec: row.durationSec,
    prompt: row.prompt,
    packId: row.packId,
    modelId: row.modelId,
    jobId: row.jobId,
    parentMediaId: row.parentMediaId,
    folderId: row.folderId,
    isDraft: row.isDraft,
    isFavorite: row.isFavorite,
    hidden: row.hidden,
    watermarked: row.watermarked,
    scores: row.scores,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Load media owned by the user (not deleted/removed). Throws AppError not_found. */
export async function getOwnedMedia(userId: string, mediaId: string): Promise<MediaRow> {
  const [row] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.userId, userId), isNull(media.deletedAt), isNull(media.removedAt)))
    .limit(1);
  if (!row) throw errors.notFound("Photo");
  return row;
}

/** Load an upload owned by the user with the given purpose. Throws AppError not_found. */
export async function getOwnedUpload(userId: string, uploadId: string, purpose?: UploadRow["purpose"]): Promise<UploadRow> {
  const [row] = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.userId, userId), purpose ? eq(uploads.purpose, purpose) : undefined))
    .limit(1);
  if (!row) throw errors.notFound("Upload");
  return row;
}

/** URL an AI provider can fetch for a stored object (signed URL if storage is public, else provider upload). */
export async function providerInputUrl(storageKey: string, contentType?: string): Promise<string> {
  const storage = getStorage();
  if (storage.publiclyReachable) return storage.getSignedUrl(storageKey, { expiresInSec: PROVIDER_INPUT_URL_TTL_SEC });
  const bytes = await storage.get(storageKey);
  const filename = storageKey.split("/").pop();
  return getImageProvider().uploadInput(bytes, contentType ?? mimeForKey(storageKey), filename);
}

export interface IngestResult {
  mediaIds: string[];
  blockedCount: number;
}

export interface IngestImagesOptions {
  isDraft?: boolean;
  prompt?: string;
  seed?: number;
  /** Score likeness against the job's identity model (default true; off for multi-person scenes). */
  scoreLikeness?: boolean;
}

interface PreparedImage {
  index: number;
  id: string;
  key: string;
  thumbKey: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  seed: number | null;
  likeness: number | null;
  quality: number | null;
  moderation: ModerationSnapshot;
}

function providerFor(job: JobRow): AsyncAIProvider {
  return getAIProvider(job.provider ?? env.aiProvider);
}

async function loadJobContext(job: JobRow) {
  const [owner] = await db.select().from(userTable).where(eq(userTable.id, job.userId)).limit(1);
  if (!owner) throw new Error(`job ${job.id}: owner not found`);
  // The job's model was authorized when the job was planned (it may be shared via multi-person consent).
  const [model] = job.modelId
    ? await db
        .select({ consentEmbedding: identityModels.consentEmbedding })
        .from(identityModels)
        .where(eq(identityModels.id, job.modelId))
        .limit(1)
    : [];
  return { owner, embedding: model?.consentEmbedding ?? null };
}

/** Best-effort removal of objects written before a failure (keeps storage free of orphans). */
async function deleteKeys(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const storage = getStorage();
  await Promise.allSettled(keys.map((k) => storage.delete(k)));
}

async function safeLikeness(bytes: Uint8Array, embedding: number[]): Promise<number | null> {
  try {
    return await likenessScore(bytes, embedding);
  } catch (err) {
    console.warn("[media] likeness scoring failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Store provider outputs as media: download -> safety check (blocked outputs are discarded,
 * never stored) -> likeness/quality scores -> AI label metadata -> watermark (free tier) ->
 * thumbnail -> storage -> media rows. Applies the best-shots picker (hides weak outputs).
 */
export async function ingestImages(job: JobRow, images: ProviderImage[], opts?: IngestImagesOptions): Promise<IngestResult> {
  const provider = providerFor(job);
  const storage = getStorage();
  const { owner, embedding } = await loadJobContext(job);
  const watermark = shouldWatermark(owner, env.WATERMARK_FREE_TIER);
  const scoreLikeness = (opts?.scoreLikeness ?? true) && Array.isArray(embedding) && embedding.length > 0;
  const ctx = { userId: job.userId, jobId: job.id, modelId: job.modelId ?? undefined };

  let blockedCount = 0;
  const prepared: PreparedImage[] = [];
  const written: string[] = [];
  try {
    for (const [index, image] of images.entries()) {
      // The provider's own safety checker flagged it: never download or store it.
      if (image.nsfw === true) {
        blockedCount++;
        await recordModerationEvent("output_blocked", ctx, { source: "provider", provider: provider.name, index });
        continue;
      }
      const { bytes } = await provider.fetchOutput(image.url);
      const moderation = await checkOutputImage(bytes, ctx);
      if (!moderation.allowed) {
        blockedCount++;
        continue;
      }
      const likeness = scoreLikeness ? await safeLikeness(bytes, embedding!) : null;
      const metrics = await imageMetrics(bytes);

      // Watermark first, AI label last: re-encoding for the watermark must not strip the label.
      const visible = watermark ? await applyWatermark(bytes, APP.name) : bytes;
      const labeled = await applyAiLabel(visible, { generator: APP.name, jobId: job.id, createdAt: new Date() });
      const thumb = await makeThumbnail(labeled.bytes);

      const id = newId("med");
      const key = storageKeys.media(job.userId, id, extForMime(labeled.mimeType));
      const thumbKey = storageKeys.mediaThumb(job.userId, id);
      await storage.put(key, labeled.bytes, { contentType: labeled.mimeType });
      written.push(key);
      await storage.put(thumbKey, thumb, { contentType: "image/webp" });
      written.push(thumbKey);

      prepared.push({
        index,
        id,
        key,
        thumbKey,
        mimeType: labeled.mimeType,
        bytes: labeled.bytes.byteLength,
        width: metrics.width || image.width || null,
        height: metrics.height || image.height || null,
        seed: image.seed ?? opts?.seed ?? null,
        likeness,
        quality: qualityFromMetrics(metrics),
        moderation,
      });
    }

    const scores = prepared.map((p) => buildScores(p.likeness, p.quality));
    const decisions = pickBestShots(scores);
    const rows: NewMediaRow[] = prepared.map((p, i) => ({
      id: p.id,
      userId: job.userId,
      jobId: job.id,
      modelId: job.modelId,
      kind: "image",
      storageKey: p.key,
      thumbKey: p.thumbKey,
      mimeType: p.mimeType,
      bytes: p.bytes,
      width: p.width,
      height: p.height,
      prompt: opts?.prompt ?? null,
      packId: job.packId,
      batchId: job.batchId,
      isDraft: opts?.isDraft ?? false,
      hidden: decisions[i]!.hidden,
      parentMediaId: job.sourceMediaId,
      seed: p.seed,
      scores: scores[i]!,
      moderation: p.moderation,
      watermarked: watermark,
    }));
    if (rows.length) await db.insert(media).values(rows);

    // Likeness guarantee: outputs that don't look like the person are hidden and refunded.
    const perImage = Math.floor(job.creditsCharged / Math.max(expectedOutputs(job.input), images.length));
    if (perImage > 0) {
      for (const [i, d] of decisions.entries()) {
        if (!d.lowLikeness) continue;
        await refundJob(job.id, {
          amount: perImage,
          tag: `likeness:${prepared[i]!.index}`,
          note: "Likeness guarantee: this photo didn't look enough like you.",
        });
      }
    }
    return { mediaIds: prepared.map((p) => p.id), blockedCount };
  } catch (err) {
    await deleteKeys(written);
    throw err;
  }
}

export async function ingestVideos(job: JobRow, videos: ProviderVideo[], opts?: { prompt?: string }): Promise<IngestResult> {
  const provider = providerFor(job);
  const storage = getStorage();
  const ctx = { userId: job.userId, jobId: job.id, modelId: job.modelId ?? undefined };

  let blockedCount = 0;
  const rows: NewMediaRow[] = [];
  const written: string[] = [];
  try {
    for (const video of videos) {
      const { bytes, contentType } = await provider.fetchOutput(video.url);
      const moderation = await checkOutputVideo(bytes, ctx);
      if (!moderation.allowed) {
        blockedCount++;
        continue;
      }
      const probe = await extractVideoFrames(bytes, 1);
      const firstFrame = probe.frames[0];
      const thumb = firstFrame ? await makeThumbnail(firstFrame) : null;

      const mimeType = (video.contentType ?? contentType ?? "video/mp4").split(";")[0]!.trim() || "video/mp4";
      const id = newId("med");
      const key = storageKeys.media(job.userId, id, mimeType.startsWith("video/") ? extForMime(mimeType) : "mp4");
      const thumbKey = thumb ? storageKeys.mediaThumb(job.userId, id) : null;
      await storage.put(key, bytes, { contentType: mimeType });
      written.push(key);
      if (thumb && thumbKey) {
        await storage.put(thumbKey, thumb, { contentType: "image/webp" });
        written.push(thumbKey);
      }
      rows.push({
        id,
        userId: job.userId,
        jobId: job.id,
        modelId: job.modelId,
        kind: "video",
        storageKey: key,
        thumbKey,
        mimeType,
        bytes: bytes.byteLength,
        width: probe.width || null,
        height: probe.height || null,
        durationSec: probe.durationSec || video.durationSec || null,
        prompt: opts?.prompt ?? null,
        packId: job.packId,
        batchId: job.batchId,
        parentMediaId: job.sourceMediaId,
        moderation,
      });
    }
    if (rows.length) await db.insert(media).values(rows);
    return { mediaIds: rows.map((r) => r.id!), blockedCount };
  } catch (err) {
    await deleteKeys(written);
    throw err;
  }
}

/** Delete a job's media rows + objects (used when a completion attempt is discarded or retried). */
export async function deleteJobMedia(job: Pick<JobRow, "id" | "userId">): Promise<number> {
  const rows = await db
    .delete(media)
    .where(and(eq(media.jobId, job.id), eq(media.userId, job.userId)))
    .returning({ key: media.storageKey, thumbKey: media.thumbKey });
  await deleteKeys(rows.flatMap((r) => (r.thumbKey ? [r.key, r.thumbKey] : [r.key])));
  return rows.length;
}

/** Delete specific media rows (owned by `userId`) + their objects. */
export async function deleteMediaByIds(userId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await db
    .delete(media)
    .where(and(eq(media.userId, userId), inArray(media.id, ids)))
    .returning({ key: media.storageKey, thumbKey: media.thumbKey });
  await deleteKeys(rows.flatMap((r) => (r.thumbKey ? [r.key, r.thumbKey] : [r.key])));
  return rows.length;
}
