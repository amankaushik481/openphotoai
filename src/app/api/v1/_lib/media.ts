/** Gallery listing for the public API: the user's live media, newest first, with keyset pagination. */
import { and, desc, eq, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import type { MediaRow } from "@/db/types";
import { errors } from "@/server/http";
import type { V1ListMediaQuery } from "@/server/openapi/queries";

function encodeCursor(row: Pick<MediaRow, "createdAt" | "id">): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const createdAt = new Date(iso ?? "");
  if (!id || Number.isNaN(createdAt.getTime())) throw errors.validation("Invalid cursor.");
  return { createdAt, id };
}

/** Postgres keeps microseconds but JS Dates (and so cursors) keep milliseconds: compare at ms precision. */
const createdMs = sql`date_trunc('milliseconds', ${media.createdAt})`;

export async function listMediaForUser(
  userId: string,
  q: V1ListMediaQuery,
): Promise<{ media: MediaRow[]; nextCursor: string | null }> {
  const conds: (SQL | undefined)[] = [eq(media.userId, userId), isNull(media.deletedAt), isNull(media.removedAt)];
  if (q.folderId) conds.push(eq(media.folderId, q.folderId));
  if (q.favorite !== undefined) conds.push(eq(media.isFavorite, q.favorite));
  if (q.kind) conds.push(eq(media.kind, q.kind));
  if (q.modelId) conds.push(eq(media.modelId, q.modelId));
  if (q.packId) conds.push(eq(media.packId, q.packId));
  if (q.batchId) conds.push(eq(media.batchId, q.batchId));
  if (!q.showHidden) conds.push(eq(media.hidden, false));
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    conds.push(or(sql`${createdMs} < ${c.createdAt}`, and(sql`${createdMs} = ${c.createdAt}`, lt(media.id, c.id))));
  }
  const rows = await db
    .select()
    .from(media)
    .where(and(...conds))
    .orderBy(desc(createdMs), desc(media.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return { media: page, nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!) : null };
}
