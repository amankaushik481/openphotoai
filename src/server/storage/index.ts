/**
 * Storage facade. CONTRACT FILE (owner: storage workstream).
 * All object keys are created with `storageKeys` so per-user deletion is a single prefix delete.
 */
import path from "node:path";
import { env } from "@/lib/env";
import type { StorageProvider } from "@/providers/types";
import { createLocalStorage } from "@/providers/storage/local";
import { createS3Storage } from "@/providers/storage/s3";

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

let cached: StorageProvider | null = null;
let override: StorageProvider | null = null;

function createFromEnv(): StorageProvider {
  if (env.STORAGE_DRIVER === "s3") {
    const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
    // env.ts already enforces these; the check narrows the types.
    if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
      throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY");
    }
    return createS3Storage({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: S3_BUCKET,
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }
  return createLocalStorage({
    dir: path.resolve(/* turbopackIgnore: true */ env.LOCAL_STORAGE_DIR),
    baseUrl: env.NEXT_PUBLIC_APP_URL,
    secret: env.authSecret,
  });
}

/** The configured storage provider (local disk or S3-compatible). Cached per process. */
export function getStorage(): StorageProvider {
  if (override) return override;
  cached ??= createFromEnv();
  return cached;
}

/**
 * Test hook: force a storage provider (e.g. `createLocalStorage({ dir: tmp, ... })`).
 * Passing `null` removes the override and drops the cached env-based provider.
 */
export function setStorageForTesting(provider: StorageProvider | null): void {
  override = provider;
  if (provider === null) cached = null;
}

/** Signed read URL for the browser (default 1h). */
export async function signedUrl(key: string, opts?: { expiresInSec?: number; downloadName?: string }): Promise<string> {
  return getStorage().getSignedUrl(key, opts);
}
