/**
 * S3-compatible storage driver (AWS S3, Cloudflare R2, MinIO, Backblaze B2...).
 * The AWS SDK is imported lazily on first use so creating the provider stays cheap.
 */
import type { S3Client } from "@aws-sdk/client-s3";
import type { PutOptions, StorageProvider } from "@/providers/types";
import { AppError } from "@/server/http";
import { assertSafeKey, assertSafePrefix, attachmentDisposition } from "./keys";

export interface S3StorageOptions {
  /** Custom endpoint for R2 / MinIO (omit for AWS). */
  endpoint?: string;
  /** AWS region, or "auto" for R2. */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Path-style URLs (`endpoint/bucket/key`), required by MinIO. */
  forcePathStyle: boolean;
}

const DEFAULT_TTL_SEC = 3600;
/** SigV4 presigned URLs are valid for at most 7 days. */
const MAX_TTL_SEC = 7 * 24 * 3600;
/** DeleteObjects accepts at most 1000 keys per request. */
const DELETE_BATCH = 1000;

type S3Module = typeof import("@aws-sdk/client-s3");

function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NoSuchKey" || e.name === "NotFound" || e.$metadata?.httpStatusCode === 404;
}

export function createS3Storage(opts: S3StorageOptions): StorageProvider {
  const Bucket = opts.bucket;
  let loading: Promise<{ s3: S3Module; client: S3Client }> | undefined;

  const sdk = () => {
    loading ??= (async () => {
      const s3 = await import("@aws-sdk/client-s3");
      const client = new s3.S3Client({
        region: opts.region,
        endpoint: opts.endpoint,
        forcePathStyle: opts.forcePathStyle,
        credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
        // Only send/validate checksums when an operation requires them: several S3-compatible
        // services (older MinIO, B2, some R2 setups) reject the SDK's default CRC32 headers.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });
      return { s3, client };
    })().catch((err: unknown) => {
      loading = undefined;
      throw err;
    });
    return loading;
  };

  return {
    name: "s3",
    publiclyReachable: true,

    async put(key: string, body: Uint8Array, o: PutOptions): Promise<void> {
      assertSafeKey(key);
      const { s3, client } = await sdk();
      await client.send(
        new s3.PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: o.contentType, CacheControl: o.cacheControl }),
      );
    },

    async get(key: string): Promise<Uint8Array> {
      assertSafeKey(key);
      const { s3, client } = await sdk();
      try {
        const res = await client.send(new s3.GetObjectCommand({ Bucket, Key: key }));
        if (!res.Body) throw new AppError("not_found", "File not found.");
        return await res.Body.transformToByteArray();
      } catch (err) {
        if (isNotFound(err)) throw new AppError("not_found", "File not found.");
        throw err;
      }
    },

    async exists(key: string): Promise<boolean> {
      assertSafeKey(key);
      const { s3, client } = await sdk();
      try {
        await client.send(new s3.HeadObjectCommand({ Bucket, Key: key }));
        return true;
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
    },

    async delete(key: string): Promise<void> {
      assertSafeKey(key);
      const { s3, client } = await sdk();
      await client.send(new s3.DeleteObjectCommand({ Bucket, Key: key }));
    },

    async deletePrefix(prefix: string): Promise<number> {
      assertSafePrefix(prefix);
      const { s3, client } = await sdk();
      let deleted = 0;
      let token: string | undefined;
      do {
        const page = await client.send(
          new s3.ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: DELETE_BATCH }),
        );
        const keys = (page.Contents ?? []).map((o) => o.Key).filter((k): k is string => typeof k === "string");
        for (let i = 0; i < keys.length; i += DELETE_BATCH) {
          const batch = keys.slice(i, i + DELETE_BATCH);
          const res = await client.send(
            new s3.DeleteObjectsCommand({ Bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }),
          );
          const failed = res.Errors ?? [];
          if (failed.length > 0) {
            const first = failed[0];
            throw new Error(`S3 deletePrefix: ${failed.length} object(s) not deleted (${first?.Code ?? "error"}: ${first?.Key ?? "?"})`);
          }
          deleted += batch.length;
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return deleted;
    },

    async getSignedUrl(key: string, o?: { expiresInSec?: number; downloadName?: string }): Promise<string> {
      assertSafeKey(key);
      const [{ s3, client }, { getSignedUrl }] = await Promise.all([sdk(), import("@aws-sdk/s3-request-presigner")]);
      const expiresIn = Math.min(Math.max(Math.floor(o?.expiresInSec ?? DEFAULT_TTL_SEC), 1), MAX_TTL_SEC);
      const command = new s3.GetObjectCommand({
        Bucket,
        Key: key,
        ...(o?.downloadName ? { ResponseContentDisposition: attachmentDisposition(o.downloadName) } : {}),
      });
      return getSignedUrl(client, command, { expiresIn });
    },
  };
}
