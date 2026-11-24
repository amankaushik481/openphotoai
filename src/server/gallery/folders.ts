/** Gallery folders (per user). Deleting a folder keeps its media (`folder_id` is set to null). */
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { folders, media } from "@/db/schema";
import type { FolderRow } from "@/db/types";
import { errors } from "@/server/http";
import { FOLDER_NAME_MAX, MAX_FOLDERS, type FolderDTO } from "./dto";

export const folderNameRequest = z.object({
  name: z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Name is required.").max(FOLDER_NAME_MAX, `Use at most ${FOLDER_NAME_MAX} characters.`)),
});

export function toFolderDTO(row: FolderRow, mediaCount = 0): FolderDTO {
  return { id: row.id, name: row.name, mediaCount, createdAt: row.createdAt.toISOString() };
}

/** Throws not_found unless the folder belongs to the user. */
export async function getOwnedFolder(userId: string, folderId: string): Promise<FolderRow> {
  const [row] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .limit(1);
  if (!row) throw errors.notFound("Folder");
  return row;
}

/** The user's folders (alphabetical) with visible media counts. */
export async function listFolders(userId: string): Promise<FolderDTO[]> {
  const [rows, counts] = await Promise.all([
    db.select().from(folders).where(eq(folders.userId, userId)).orderBy(asc(folders.name), asc(folders.id)),
    db
      .select({ folderId: media.folderId, n: count() })
      .from(media)
      .where(and(eq(media.userId, userId), isNull(media.deletedAt), isNull(media.removedAt)))
      .groupBy(media.folderId),
  ]);
  const byFolder = new Map(counts.map((c) => [c.folderId, c.n]));
  return rows.map((r) => toFolderDTO(r, byFolder.get(r.id) ?? 0));
}

export async function createFolder(userId: string, name: string): Promise<FolderDTO> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ n: count() }).from(folders).where(eq(folders.userId, userId));
    if ((existing?.n ?? 0) >= MAX_FOLDERS) {
      throw errors.planLimit(`You can have up to ${MAX_FOLDERS} folders. Delete one to add another.`);
    }
    const [row] = await tx.insert(folders).values({ userId, name }).returning();
    return toFolderDTO(row!);
  });
}

export async function renameFolder(userId: string, folderId: string, name: string): Promise<FolderDTO> {
  const [row] = await db
    .update(folders)
    .set({ name })
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .returning();
  if (!row) throw errors.notFound("Folder");
  const [c] = await db
    .select({ n: count() })
    .from(media)
    .where(and(eq(media.userId, userId), eq(media.folderId, folderId), isNull(media.deletedAt), isNull(media.removedAt)));
  return toFolderDTO(row, c?.n ?? 0);
}

/** Delete a folder; its media stay in the gallery. Folder share links go with it (FK cascade). */
export async function deleteFolder(userId: string, folderId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // The FK would null folder_id too; doing it explicitly keeps "media are kept" independent of it.
    await tx.update(media).set({ folderId: null }).where(and(eq(media.userId, userId), eq(media.folderId, folderId)));
    const [row] = await tx
      .delete(folders)
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .returning({ id: folders.id });
    if (!row) throw errors.notFound("Folder");
  });
}
