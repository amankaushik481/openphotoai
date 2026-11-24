/**
 * Upload retention (SAF-19). Uploads (pose/style references, which can show third parties; try-on
 * garments; brush masks) are job inputs, not gallery items: they are deleted after
 * UPLOAD_RETENTION_DAYS by the maintenance cron, and users can delete one any time
 * (DELETE /api/uploads/:id). Derived copies (normalized masks `<id>_<w>x<h>.png`) share the
 * upload's storage-key prefix and go with it.
 */
import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { errors } from "@/server/http";
import { getStorage } from "@/server/storage";

/** Jobs read their inputs within minutes; a month leaves room for retries and draft re-renders. */
export const UPLOAD_RETENTION_DAYS = 30;
/** Uploads purged per maintenance run (bounded; the next run continues). */
const PRUNE_BATCH = 200;
const DAY_MS = 86_400_000;

/** Storage prefix covering an upload and its derived copies ("…/upl_x.jpg" → "…/upl_x"). */
function objectPrefix(storageKey: string): string {
  return storageKey.replace(/\.[a-z0-9]+$/i, "");
}

async function deleteObjects(storageKey: string): Promise<void> {
  const storage = getStorage();
  await storage.delete(storageKey);
  await storage.deletePrefix(`${objectPrefix(storageKey)}_`);
}

/** Delete one of the user's uploads (objects first, then the row). Throws not_found for foreign/unknown ids. */
export async function deleteUpload(userId: string, uploadId: string): Promise<void> {
  const [row] = await db
    .select({ id: uploads.id, storageKey: uploads.storageKey })
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.userId, userId)))
    .limit(1);
  if (!row) throw errors.notFound("Upload");
  await deleteObjects(row.storageKey);
  await db.delete(uploads).where(and(eq(uploads.id, row.id), eq(uploads.userId, userId)));
}

/** Delete uploads older than the retention period (objects, then rows). Returns how many were deleted. */
export async function pruneExpiredUploads(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - UPLOAD_RETENTION_DAYS * DAY_MS);
  const expired = await db
    .select({ id: uploads.id, userId: uploads.userId, storageKey: uploads.storageKey })
    .from(uploads)
    .where(lt(uploads.createdAt, cutoff))
    .orderBy(asc(uploads.createdAt))
    .limit(PRUNE_BATCH);
  let deleted = 0;
  for (const row of expired) {
    try {
      await deleteObjects(row.storageKey);
      await db.delete(uploads).where(and(eq(uploads.id, row.id), eq(uploads.userId, row.userId)));
      deleted++;
    } catch (err) {
      // Keep the row so the next run retries; one bad object must not stop the batch.
      console.error(`[uploads] couldn't delete expired upload ${row.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return deleted;
}
