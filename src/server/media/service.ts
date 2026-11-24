/**
 * Media helpers. CONTRACT FILE (owner: job-engine workstream).
 */
import type { JobRow, MediaRow, UploadRow } from "@/db/types";
import type { ProviderImage, ProviderVideo } from "@/providers/types";
import type { MediaDTO } from "@/types/domain";

/** DTO with signed URLs (url/thumbUrl/downloadUrl). */
export async function toMediaDTO(row: MediaRow): Promise<MediaDTO> {
  void row;
  throw new Error("not implemented: toMediaDTO (job-engine)");
}

/** Load media owned by the user (not deleted/removed). Throws AppError not_found. */
export async function getOwnedMedia(userId: string, mediaId: string): Promise<MediaRow> {
  void userId;
  void mediaId;
  throw new Error("not implemented: getOwnedMedia (job-engine)");
}

/** Load an upload owned by the user with the given purpose. Throws AppError not_found. */
export async function getOwnedUpload(userId: string, uploadId: string, purpose?: UploadRow["purpose"]): Promise<UploadRow> {
  void userId;
  void uploadId;
  void purpose;
  throw new Error("not implemented: getOwnedUpload (job-engine)");
}

/** URL an AI provider can fetch for a stored object (signed URL if storage is public, else provider upload). */
export async function providerInputUrl(storageKey: string, contentType?: string): Promise<string> {
  void storageKey;
  void contentType;
  throw new Error("not implemented: providerInputUrl (job-engine)");
}

export interface IngestResult {
  mediaIds: string[];
  blockedCount: number;
}

/**
 * Store provider outputs as media: download -> safety check (blocked outputs are discarded,
 * never stored) -> likeness/quality scores -> AI label metadata -> watermark (free tier) ->
 * thumbnail -> storage -> media rows. Applies the best-shots picker (hides weak outputs).
 */
export async function ingestImages(job: JobRow, images: ProviderImage[], opts?: { isDraft?: boolean; prompt?: string; seed?: number }): Promise<IngestResult> {
  void job;
  void images;
  void opts;
  throw new Error("not implemented: ingestImages (job-engine)");
}

export async function ingestVideos(job: JobRow, videos: ProviderVideo[], opts?: { prompt?: string }): Promise<IngestResult> {
  void job;
  void videos;
  void opts;
  throw new Error("not implemented: ingestVideos (job-engine)");
}
