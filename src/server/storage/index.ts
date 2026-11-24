/**
 * Storage facade. CONTRACT FILE (owner: storage workstream).
 * All object keys are created with `storageKeys` so per-user deletion is a single prefix delete.
 */
import type { StorageProvider } from "@/providers/types";

export const storageKeys = {
  userPrefix: (userId: string) => `users/${userId}/`,
  modelPrefix: (userId: string, modelId: string) => `users/${userId}/models/${modelId}/`,
  consentSelfie: (userId: string, modelId: string, id: string) => `users/${userId}/models/${modelId}/consent/${id}.jpg`,
  trainingPhoto: (userId: string, modelId: string, photoId: string) =>
    `users/${userId}/models/${modelId}/photos/${photoId}.jpg`,
  trainingPhotoThumb: (userId: string, modelId: string, photoId: string) =>
    `users/${userId}/models/${modelId}/photos/${photoId}_thumb.webp`,
  trainingZip: (userId: string, modelId: string, jobId: string) => `users/${userId}/models/${modelId}/training/${jobId}.zip`,
  media: (userId: string, mediaId: string, ext: string) => `users/${userId}/media/${mediaId}.${ext}`,
  mediaThumb: (userId: string, mediaId: string) => `users/${userId}/media/${mediaId}_thumb.webp`,
  upload: (userId: string, uploadId: string, ext: string) => `users/${userId}/uploads/${uploadId}.${ext}`,
} as const;

/** The configured storage provider (local disk or S3-compatible). */
export function getStorage(): StorageProvider {
  throw new Error("not implemented: getStorage (storage workstream)");
}

/** Signed read URL for the browser (default 1h). */
export async function signedUrl(key: string, opts?: { expiresInSec?: number; downloadName?: string }): Promise<string> {
  return getStorage().getSignedUrl(key, opts);
}
