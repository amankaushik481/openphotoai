/** Moderation queue: open abuse reports + unreviewed safety events, and the actions on them. */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Database, type Tx } from "@/db";
import { media, moderationEvents, reports, shareLinks, user } from "@/db/schema";
import type { ModerationEventRow, ReportRow, UserRow } from "@/db/types";
import { errors } from "@/server/http";
import { getStorage, signedUrl } from "@/server/storage";
import type { MediaKind, ModerationEventKind } from "@/types/domain";
import type { ReportAction } from "./schemas";
import { assertSuspendable, loadUserOrThrow, notifySuspended, suspendUserTx, type SuspendResult } from "./users";

const QUEUE_LIMIT = 100;
/** Thumbnails in the queue are short-lived. */
const THUMB_TTL_SEC = 15 * 60;

export const REPORT_REASON_LABELS: Record<ReportRow["reason"], string> = {
  non_consensual: "Non-consensual image",
  sexual: "Sexual content",
  minor: "Involves a minor",
  impersonation: "Impersonation",
  harassment: "Harassment",
  copyright: "Copyright",
  other: "Other",
};

export interface QueueReport {
  id: string;
  reason: ReportRow["reason"];
  details: string | null;
  reporterEmail: string | null;
  reporterUserId: string | null;
  createdAt: Date;
  target: { id: string; email: string; banned: boolean; role: UserRow["role"] } | null;
  media: {
    id: string;
    kind: MediaKind;
    prompt: string | null;
    removedAt: Date | null;
    /** Signed thumbnail URL (null for removed media or when signing fails). */
    thumbUrl: string | null;
  } | null;
  shareLink: { id: string; token: string; revokedAt: Date | null; folderId: string | null } | null;
}

export interface QueueEvent {
  id: string;
  kind: ModerationEventKind;
  details: Record<string, unknown>;
  userId: string | null;
  userEmail: string | null;
  jobId: string | null;
  modelId: string | null;
  createdAt: Date;
}

async function thumbUrlFor(row: { thumbKey: string | null; storageKey: string; kind: MediaKind; removedAt: Date | null }) {
  if (row.removedAt) return null;
  const key = row.thumbKey ?? (row.kind === "image" ? row.storageKey : null);
  if (!key) return null;
  try {
    return await signedUrl(key, { expiresInSec: THUMB_TTL_SEC });
  } catch (err) {
    console.warn("[admin] could not sign moderation thumbnail:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Open reports and unreviewed moderation events, each newest first (max 100 of each). */
export async function listModerationQueue(): Promise<{ reports: QueueReport[]; events: QueueEvent[] }> {
  const target = alias(user, "target_user");
  const [reportRows, eventRows] = await Promise.all([
    db
      .select({
        report: reports,
        target: { id: target.id, email: target.email, banned: target.banned, role: target.role },
        media: {
          id: media.id,
          kind: media.kind,
          prompt: media.prompt,
          removedAt: media.removedAt,
          thumbKey: media.thumbKey,
          storageKey: media.storageKey,
        },
        shareLink: {
          id: shareLinks.id,
          token: shareLinks.token,
          revokedAt: shareLinks.revokedAt,
          folderId: shareLinks.folderId,
        },
      })
      .from(reports)
      .leftJoin(target, eq(target.id, reports.targetUserId))
      .leftJoin(media, eq(media.id, reports.mediaId))
      .leftJoin(shareLinks, eq(shareLinks.id, reports.shareLinkId))
      .where(eq(reports.status, "open"))
      .orderBy(desc(reports.createdAt), desc(reports.id))
      .limit(QUEUE_LIMIT),
    db
      .select({ event: moderationEvents, userEmail: user.email })
      .from(moderationEvents)
      .leftJoin(user, eq(user.id, moderationEvents.userId))
      .where(eq(moderationEvents.reviewed, false))
      .orderBy(desc(moderationEvents.createdAt), desc(moderationEvents.id))
      .limit(QUEUE_LIMIT),
  ]);

  const queueReports = await Promise.all(
    reportRows.map(async ({ report, target: t, media: m, shareLink }): Promise<QueueReport> => ({
      id: report.id,
      reason: report.reason,
      details: report.details,
      reporterEmail: report.reporterEmail,
      reporterUserId: report.reporterUserId,
      createdAt: report.createdAt,
      target: t ? { ...t, banned: t.banned === true } : null,
      media: m
        ? { id: m.id, kind: m.kind, prompt: m.prompt, removedAt: m.removedAt, thumbUrl: await thumbUrlFor(m) }
        : null,
      shareLink,
    })),
  );

  return {
    reports: queueReports,
    events: eventRows.map(({ event, userEmail }) => ({
      id: event.id,
      kind: event.kind,
      details: event.details,
      userId: event.userId,
      userEmail,
      jobId: event.jobId,
      modelId: event.modelId,
      createdAt: event.createdAt,
    })),
  };
}

/* ───────────────────────────── media removal ───────────────────────────── */

/** Most derived media (edits, upscales, videos... of the removed one) a takedown cascades to. */
const MAX_TAKEDOWN_DESCENDANTS = 500;
const MAX_TAKEDOWN_DEPTH = 16;

/**
 * Takedown, database part (inside the caller's transaction): mark the media removed, together with
 * everything derived from it (edits, upscales, videos made from it, recursively through
 * `parentMediaId`), and revoke every share link pointing at any of them. Returns the storage keys
 * to delete once the transaction commits.
 */
export async function removeMediaTx(tx: Database | Tx, mediaId: string): Promise<{ keys: string[]; shareLinksRevoked: number }> {
  const [root] = await tx.select({ id: media.id }).from(media).where(eq(media.id, mediaId)).limit(1);
  if (!root) throw errors.notFound("Media");
  // Breadth-first through parentMediaId (bounded: derivation chains are short).
  const ids = [mediaId];
  let frontier = [mediaId];
  for (let depth = 0; frontier.length > 0 && depth < MAX_TAKEDOWN_DEPTH && ids.length < MAX_TAKEDOWN_DESCENDANTS; depth++) {
    const children = await tx
      .select({ id: media.id })
      .from(media)
      .where(inArray(media.parentMediaId, frontier))
      .limit(MAX_TAKEDOWN_DESCENDANTS);
    frontier = children.map((c) => c.id).filter((id) => !ids.includes(id));
    ids.push(...frontier);
  }

  const rows = await tx
    .select({ storageKey: media.storageKey, thumbKey: media.thumbKey })
    .from(media)
    .where(inArray(media.id, ids));
  await tx.update(media).set({ removedAt: new Date() }).where(and(inArray(media.id, ids), isNull(media.removedAt)));
  const revoked = await tx
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(inArray(shareLinks.mediaId, ids), isNull(shareLinks.revokedAt)))
    .returning({ id: shareLinks.id });
  return { keys: rows.flatMap((r) => [r.storageKey, ...(r.thumbKey ? [r.thumbKey] : [])]), shareLinksRevoked: revoked.length };
}

/** Delete storage objects; a failure is logged (the media row already says "removed"). */
export async function deleteStorageObjects(keys: readonly string[]): Promise<void> {
  const storage = getStorage();
  const results = await Promise.allSettled(keys.map((key) => storage.delete(key)));
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[admin] failed to delete storage object ${keys[i]}:`, r.reason instanceof Error ? r.reason.message : r.reason);
    }
  });
}

/* ───────────────────────────── report resolution ───────────────────────────── */

export interface ResolveReportResult {
  report: ReportRow;
  action: ReportAction;
  mediaRemoved?: boolean;
  shareLinksRevoked?: number;
  suspension?: Pick<SuspendResult, "suspended" | "sessionsDeleted" | "shareLinksRevoked">;
}

function defaultSuspensionReason(report: Pick<ReportRow, "reason">): string {
  return `Your content was reported and reviewed by our team (${REPORT_REASON_LABELS[report.reason].toLowerCase()}). It breaks our acceptable use policy.`;
}

/**
 * Resolve an open report:
 *  - `dismiss`: no action against the user (status "dismissed").
 *  - `remove_media`: takedown of the reported media (removedAt, storage objects deleted, share
 *    links to it revoked); for a folder share without a single media, the share link is revoked.
 *  - `suspend_user`: suspend the content owner (see suspendUser).
 * Every resolution writes a `report_actioned` audit event (stored as reviewed).
 * Throws conflict when the report was already resolved.
 */
export async function resolveReport(
  adminId: string,
  reportId: string,
  action: ReportAction,
  note = "",
): Promise<ResolveReportResult> {
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  if (!report) throw errors.notFound("Report");
  if (report.status !== "open") throw errors.conflict("This report was already resolved.");
  const trimmed = note.trim();

  // Validate the action before claiming the report.
  let target: UserRow | null = null;
  if (action === "suspend_user") {
    if (!report.targetUserId) throw errors.validation("This report has no owner to suspend.");
    target = await loadUserOrThrow(report.targetUserId);
    assertSuspendable(adminId, target);
  }
  if (action === "remove_media" && !report.mediaId && !report.shareLinkId) {
    throw errors.validation("This report isn't linked to any media or share link.");
  }

  const suspensionReason = trimmed || defaultSuspensionReason(report);
  const outcome = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(reports)
      .set({
        status: action === "dismiss" ? "dismissed" : "actioned",
        resolution: trimmed ? `${action}: ${trimmed}` : action,
        resolvedBy: adminId,
        resolvedAt: new Date(),
      })
      .where(and(eq(reports.id, reportId), eq(reports.status, "open")))
      .returning();
    if (!claimed) throw errors.conflict("This report was already resolved.");

    const result: ResolveReportResult & { storageKeys: string[] } = { report: claimed, action, storageKeys: [] };
    if (action === "remove_media") {
      if (report.mediaId) {
        const removed = await removeMediaTx(tx, report.mediaId);
        result.storageKeys = removed.keys;
        result.mediaRemoved = true;
        result.shareLinksRevoked = removed.shareLinksRevoked;
      } else if (report.shareLinkId) {
        const revoked = await tx
          .update(shareLinks)
          .set({ revokedAt: new Date() })
          .where(and(eq(shareLinks.id, report.shareLinkId), isNull(shareLinks.revokedAt)))
          .returning({ id: shareLinks.id });
        result.mediaRemoved = false;
        result.shareLinksRevoked = revoked.length;
      }
    }
    if (action === "suspend_user" && target) {
      const suspension = await suspendUserTx(tx, adminId, target, suspensionReason, { reportId });
      result.suspension = {
        suspended: suspension.suspended,
        sessionsDeleted: suspension.sessionsDeleted,
        shareLinksRevoked: suspension.shareLinksRevoked,
      };
    }

    await tx.insert(moderationEvents).values({
      userId: report.targetUserId,
      kind: "report_actioned",
      reviewed: true,
      details: {
        reportId,
        action,
        reason: report.reason,
        note: trimmed || null,
        adminId,
        mediaId: report.mediaId,
        shareLinkId: report.shareLinkId,
      },
    });
    return result;
  });

  const { storageKeys, ...result } = outcome;
  if (storageKeys.length) await deleteStorageObjects(storageKeys);
  if (target && result.suspension?.suspended) await notifySuspended(target, suspensionReason);
  return result;
}

/** Mark a safety event as reviewed (records who reviewed it and when in `details`). */
export async function markEventReviewed(adminId: string, eventId: string): Promise<ModerationEventRow> {
  const [row] = await db
    .update(moderationEvents)
    .set({
      reviewed: true,
      details: sql`${moderationEvents.details} || jsonb_build_object('reviewedBy', ${adminId}::text, 'reviewedAt', ${new Date().toISOString()}::text)`,
    })
    .where(eq(moderationEvents.id, eventId))
    .returning();
  if (!row) throw errors.notFound("Moderation event");
  return row;
}
