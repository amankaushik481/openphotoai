/**
 * Public share links (`/s/[token]`) for one media item or a whole folder.
 *
 * The token is a 32-char random capability stored as-is (column `share_links.token`) so owners can
 * copy an active link again; links can be revoked or given an expiry, and admin suspension revokes them.
 */
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { APP } from "@/config/app";
import { db } from "@/db";
import { folders, media, shareLinks } from "@/db/schema";
import type { MediaRow, ShareLinkRow } from "@/db/types";
import { newToken } from "@/lib/ids";
import { errors } from "@/server/http";
import { getOwnedMedia } from "@/server/media/service";
import { signedUrl } from "@/server/storage";
import { SHARED_FOLDER_MAX_ITEMS, type PublicMediaDTO, type ShareDTO } from "./dto";
import { getOwnedFolder } from "./folders";

const idParam = z.string().trim().min(1).max(80);
const TOKEN_RE = /^[A-Za-z0-9]{16,64}$/;

export const createShareRequest = z
  .object({
    mediaId: idParam.optional(),
    folderId: idParam.optional(),
    /** Omit for a link that never expires (it can still be revoked). */
    expiresInDays: z.number().int().min(1).max(365).optional(),
  })
  .refine((v) => Boolean(v.mediaId) !== Boolean(v.folderId), { message: "Share either a mediaId or a folderId." });
export type CreateShareRequest = z.infer<typeof createShareRequest>;

export const listSharesQuery = z
  .object({ mediaId: idParam.optional(), folderId: idParam.optional() })
  .refine((v) => Boolean(v.mediaId) !== Boolean(v.folderId), { message: "Pass either mediaId or folderId." });

export function shareUrl(token: string): string {
  return `${APP.url}/s/${token}`;
}

export function toShareDTO(row: ShareLinkRow): ShareDTO {
  return {
    id: row.id,
    token: row.token,
    url: shareUrl(row.token),
    mediaId: row.mediaId,
    folderId: row.folderId,
    views: row.views,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function activeLink(now = new Date()) {
  return and(isNull(shareLinks.revokedAt), or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, now)));
}

export async function createShare(userId: string, req: CreateShareRequest): Promise<ShareLinkRow> {
  if (req.mediaId) await getOwnedMedia(userId, req.mediaId);
  if (req.folderId) await getOwnedFolder(userId, req.folderId);
  const expiresAt = req.expiresInDays ? new Date(Date.now() + req.expiresInDays * 86_400_000) : null;
  const [row] = await db
    .insert(shareLinks)
    .values({
      token: newToken(),
      userId,
      mediaId: req.mediaId ?? null,
      folderId: req.folderId ?? null,
      expiresAt,
    })
    .returning();
  return row!;
}

/** Active links the user created for one media item or folder (newest first). */
export async function listShares(
  userId: string,
  target: { mediaId?: string; folderId?: string },
): Promise<ShareLinkRow[]> {
  return db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.userId, userId),
        target.mediaId ? eq(shareLinks.mediaId, target.mediaId) : undefined,
        target.folderId ? eq(shareLinks.folderId, target.folderId) : undefined,
        activeLink(),
      ),
    )
    .orderBy(desc(shareLinks.createdAt));
}

/** Revoke one of the user's links (idempotent; keeps the first revocation time). */
export async function revokeShare(userId: string, shareId: string): Promise<void> {
  const [row] = await db
    .update(shareLinks)
    .set({ revokedAt: sql`coalesce(${shareLinks.revokedAt}, now())` })
    .where(and(eq(shareLinks.id, shareId), eq(shareLinks.userId, userId)))
    .returning({ id: shareLinks.id });
  if (!row) throw errors.notFound("Share link");
}

/** Find a share link by token whatever its state (reports may concern revoked links). */
export async function findShareByToken(token: string): Promise<ShareLinkRow | null> {
  if (!TOKEN_RE.test(token)) return null;
  const [row] = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  return row ?? null;
}

export interface ResolvedShare {
  link: ShareLinkRow;
  /** Set for folder shares. */
  folderName: string | null;
  media: MediaRow[];
}

/**
 * Resolve a public token to what it shows. Null when the token is unknown, revoked or expired, or
 * the shared media was deleted / removed by moderation (the page renders a friendly 404).
 */
export async function resolveShare(token: string): Promise<ResolvedShare | null> {
  if (!TOKEN_RE.test(token)) return null;
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.token, token), activeLink()))
    .limit(1);
  if (!link) return null;
  const visible = and(eq(media.userId, link.userId), isNull(media.deletedAt), isNull(media.removedAt));

  if (link.mediaId) {
    const [row] = await db
      .select()
      .from(media)
      .where(and(visible, eq(media.id, link.mediaId)))
      .limit(1);
    return row ? { link, folderName: null, media: [row] } : null;
  }
  if (link.folderId) {
    const [folder] = await db
      .select({ name: folders.name })
      .from(folders)
      .where(and(eq(folders.id, link.folderId), eq(folders.userId, link.userId)))
      .limit(1);
    if (!folder) return null;
    // Weaker shots hidden by the best-shots picker stay private in folder shares.
    const rows = await db
      .select()
      .from(media)
      .where(and(visible, eq(media.folderId, link.folderId), eq(media.hidden, false)))
      .orderBy(desc(media.createdAt), desc(media.id))
      .limit(SHARED_FOLDER_MAX_ITEMS);
    return { link, folderName: folder.name, media: rows };
  }
  return null;
}

/** Best-effort view counter (never throws). */
export async function incrementShareViews(linkId: string): Promise<void> {
  try {
    await db
      .update(shareLinks)
      .set({ views: sql`${shareLinks.views} + 1` })
      .where(eq(shareLinks.id, linkId));
  } catch (err) {
    console.warn("[share] view counter failed:", err instanceof Error ? err.message : err);
  }
}

/** Signed URLs for the public page (no prompt, model or owner details). */
export async function toPublicMediaDTO(row: MediaRow, opts?: { expiresInSec?: number }): Promise<PublicMediaDTO> {
  const [url, thumbUrl] = await Promise.all([
    signedUrl(row.storageKey, opts),
    row.thumbKey ? signedUrl(row.thumbKey, opts) : Promise.resolve<string | null>(null),
  ]);
  return {
    id: row.id,
    kind: row.kind,
    url,
    thumbUrl: thumbUrl ?? url,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    durationSec: row.durationSec,
    createdAt: row.createdAt.toISOString(),
  };
}
