/**
 * Gallery queries + mutations on the user's media. Every query is scoped by `userId` and excludes
 * deleted/removed media, so ids belonging to someone else behave exactly like missing ids (404).
 */
import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { media, shareLinks } from "@/db/schema";
import type { MediaRow } from "@/db/types";
import { errors } from "@/server/http";
import { getStorage } from "@/server/storage";
import { BULK_ACTIONS, MAX_BULK_IDS } from "./dto";
import { getOwnedFolder } from "./folders";

const idParam = z.string().trim().min(1).max(80);
/** Query-string boolean: "true"/"1" or "false"/"0". */
const boolParam = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

/** Filters shared by the list API and the viewer's prev/next navigation. */
export const mediaFiltersSchema = z.object({
  folderId: idParam.optional(),
  favorite: boolParam.optional(),
  kind: z.enum(["image", "video"]).optional(),
  modelId: idParam.optional(),
  packId: idParam.optional(),
  batchId: idParam.optional(),
  /** Include media hidden by the best-shots picker (default false). */
  showHidden: boolParam.optional(),
});
export type MediaFilters = z.infer<typeof mediaFiltersSchema>;

export const listMediaQuery = mediaFiltersSchema.extend({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
export type ListMediaQuery = z.infer<typeof listMediaQuery>;

export const updateMediaRequest = z
  .object({
    isFavorite: z.boolean().optional(),
    /** `null` removes the media from its folder. */
    folderId: idParam.nullable().optional(),
    hidden: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.isFavorite !== undefined || v.folderId !== undefined || v.hidden !== undefined, {
    message: "Nothing to update.",
  });
export type UpdateMediaRequest = z.infer<typeof updateMediaRequest>;

export const mediaIdsRequest = z.object({
  ids: z.array(idParam).min(1).max(MAX_BULK_IDS),
});

export const bulkMediaRequest = mediaIdsRequest
  .extend({
    action: z.enum(BULK_ACTIONS),
    /** Target folder for `move`; `null` removes from folders. */
    folderId: idParam.nullable().optional(),
  })
  .refine((v) => v.action !== "move" || v.folderId !== undefined, {
    message: "folderId is required for move (null removes from the folder).",
    path: ["folderId"],
  });
export type BulkMediaRequest = z.infer<typeof bulkMediaRequest>;

/** Media visible to its owner: not deleted and not removed by moderation. */
function ownedVisible(userId: string): SQL {
  return and(eq(media.userId, userId), isNull(media.deletedAt), isNull(media.removedAt))!;
}

function filterConditions(userId: string, f: MediaFilters, opts: { ignoreHidden?: boolean } = {}): SQL[] {
  const conds: SQL[] = [ownedVisible(userId)];
  if (f.folderId) conds.push(eq(media.folderId, f.folderId));
  if (f.favorite !== undefined) conds.push(eq(media.isFavorite, f.favorite));
  if (f.kind) conds.push(eq(media.kind, f.kind));
  if (f.modelId) conds.push(eq(media.modelId, f.modelId));
  if (f.packId) conds.push(eq(media.packId, f.packId));
  if (f.batchId) conds.push(eq(media.batchId, f.batchId));
  if (!opts.ignoreHidden && !f.showHidden) conds.push(eq(media.hidden, false));
  return conds;
}

/**
 * Postgres keeps microseconds but JS Dates (and so cursors) keep milliseconds: compare at ms precision.
 * The explicit 'UTC' makes the expression immutable, so it is indexed (media_user_created_ms_idx) and
 * pages stay O(page size) instead of sorting the user's whole history.
 */
const createdMs = sql`date_trunc('milliseconds', ${media.createdAt}, 'UTC')`;

function encodeCursor(row: Pick<MediaRow, "createdAt" | "id">): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const createdAt = new Date(iso ?? "");
  if (!id || Number.isNaN(createdAt.getTime())) throw errors.validation("Invalid cursor.");
  return { createdAt, id };
}

/**
 * A Date as a raw-SQL timestamptz parameter. Raw `sql` templates don't get the column's encoder,
 * and the postgres-js driver rejects bare Date parameters there (PGlite happens to accept them).
 */
function tsParam(d: Date): SQL {
  return sql`${d.toISOString()}::timestamptz`;
}

/** Rows strictly older than `c` in (createdAt desc, id desc) order. */
function olderThan(c: { createdAt: Date; id: string }): SQL {
  const at = tsParam(c.createdAt);
  // Row comparison (= ms < at or (ms = at and id < c.id)) is usable as an index range condition.
  return sql`(${createdMs}, ${media.id}) < (${at}, ${c.id})`;
}

/** Rows strictly newer than `c` in (createdAt desc, id desc) order. */
function newerThan(c: { createdAt: Date; id: string }): SQL {
  const at = tsParam(c.createdAt);
  return sql`(${createdMs}, ${media.id}) > (${at}, ${c.id})`;
}

export interface MediaPage {
  media: MediaRow[];
  nextCursor: string | null;
  /** Hidden media matching the other filters (first page only). */
  hiddenCount?: number;
}

/** Newest-first page of the user's media. */
export async function listMedia(userId: string, q: ListMediaQuery): Promise<MediaPage> {
  const conds = filterConditions(userId, q);
  if (q.cursor) conds.push(olderThan(decodeCursor(q.cursor)));
  const rows = await db
    .select()
    .from(media)
    .where(and(...conds))
    .orderBy(desc(createdMs), desc(media.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const nextCursor = rows.length > q.limit ? encodeCursor(page[page.length - 1]!) : null;
  if (q.cursor) return { media: page, nextCursor };
  const [hidden] = await db
    .select({ n: count() })
    .from(media)
    .where(and(...filterConditions(userId, q, { ignoreHidden: true }), eq(media.hidden, true)));
  return { media: page, nextCursor, hiddenCount: hidden?.n ?? 0 };
}

/** Previous (newer) and next (older) media ids around `row` within the same filtered list. */
export async function getMediaNeighbors(
  userId: string,
  row: Pick<MediaRow, "createdAt" | "id">,
  filters: MediaFilters,
): Promise<{ prevId: string | null; nextId: string | null }> {
  const base = filterConditions(userId, filters);
  const [prev, next] = await Promise.all([
    db
      .select({ id: media.id })
      .from(media)
      .where(and(...base, newerThan(row)))
      .orderBy(asc(createdMs), asc(media.id))
      .limit(1),
    db
      .select({ id: media.id })
      .from(media)
      .where(and(...base, olderThan(row)))
      .orderBy(desc(createdMs), desc(media.id))
      .limit(1),
  ]);
  return { prevId: prev[0]?.id ?? null, nextId: next[0]?.id ?? null };
}

/** Load several owned media rows; throws not_found unless every id belongs to the user. */
export async function getOwnedMediaMany(userId: string, ids: readonly string[]): Promise<MediaRow[]> {
  const unique = [...new Set(ids)];
  const rows = await db
    .select()
    .from(media)
    .where(and(ownedVisible(userId), inArray(media.id, unique)));
  if (rows.length !== unique.length) throw errors.notFound("Photo");
  // Keep the caller's order (e.g. zip entries follow the selection order).
  const byId = new Map(rows.map((r) => [r.id, r]));
  return unique.map((id) => byId.get(id)!);
}

/** Apply a PATCH to one owned media row. */
export async function updateMedia(userId: string, mediaId: string, patch: UpdateMediaRequest): Promise<MediaRow> {
  if (patch.folderId) await getOwnedFolder(userId, patch.folderId);
  const [row] = await db
    .update(media)
    .set({
      ...(patch.isFavorite !== undefined ? { isFavorite: patch.isFavorite } : {}),
      ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}),
      ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
    })
    .where(and(ownedVisible(userId), eq(media.id, mediaId)))
    .returning();
  if (!row) throw errors.notFound("Photo");
  return row;
}

const STORAGE_DELETE_CONCURRENCY = 16;

/**
 * Real deletion: storage objects (original + thumbnail) first, then share links revoked and rows
 * deleted in one transaction. A storage failure aborts before any row changes, so a retry finishes
 * the job (object deletes are idempotent).
 */
export async function deleteMediaRows(userId: string, rows: readonly MediaRow[]): Promise<number> {
  const owned = rows.filter((r) => r.userId === userId);
  if (!owned.length) return 0;
  const storage = getStorage();
  const keys = owned.flatMap((r) => (r.thumbKey ? [r.storageKey, r.thumbKey] : [r.storageKey]));
  for (let i = 0; i < keys.length; i += STORAGE_DELETE_CONCURRENCY) {
    await Promise.all(keys.slice(i, i + STORAGE_DELETE_CONCURRENCY).map((k) => storage.delete(k)));
  }
  const ids = owned.map((r) => r.id);
  return db.transaction(async (tx) => {
    await tx
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareLinks.userId, userId), inArray(shareLinks.mediaId, ids), isNull(shareLinks.revokedAt)));
    const deleted = await tx
      .delete(media)
      .where(and(eq(media.userId, userId), inArray(media.id, ids)))
      .returning({ id: media.id });
    return deleted.length;
  });
}

/** Run a bulk action on owned media (all-or-nothing ownership check). Returns rows affected. */
export async function bulkMediaAction(userId: string, req: BulkMediaRequest): Promise<number> {
  const rows = await getOwnedMediaMany(userId, req.ids);
  if (req.action === "delete") return deleteMediaRows(userId, rows);

  let set: Partial<Pick<MediaRow, "isFavorite" | "hidden" | "folderId">>;
  switch (req.action) {
    case "favorite":
    case "unfavorite":
      set = { isFavorite: req.action === "favorite" };
      break;
    case "hide":
    case "unhide":
      set = { hidden: req.action === "hide" };
      break;
    case "move":
      if (req.folderId) await getOwnedFolder(userId, req.folderId);
      set = { folderId: req.folderId ?? null };
      break;
  }
  const updated = await db
    .update(media)
    .set(set)
    .where(
      and(
        ownedVisible(userId),
        inArray(
          media.id,
          rows.map((r) => r.id),
        ),
      ),
    )
    .returning({ id: media.id });
  return updated.length;
}
