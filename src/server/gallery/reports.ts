/**
 * Public abuse reports (report button on shared pages). The route rate-limits by IP; this module
 * resolves the reported owner (`targetUserId`) for the admin moderation queue and notifies the
 * takedown inbox. The response never reveals whether the reported content exists.
 */
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { APP } from "@/config/app";
import { db } from "@/db";
import { media, reports } from "@/db/schema";
import type { ReportRow, ShareLinkRow } from "@/db/types";
import { sendEmailSafe } from "@/server/email";
import { REPORT_DETAILS_MAX, REPORT_REASONS } from "./dto";
import { findShareByToken } from "./share";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const createReportRequest = z
  .object({
    shareToken: z.preprocess(emptyToUndefined, z.string().trim().max(128).optional()),
    mediaId: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
    reason: z.enum(REPORT_REASONS),
    details: z.preprocess(emptyToUndefined, z.string().trim().max(REPORT_DETAILS_MAX).optional()),
    email: z.preprocess(emptyToUndefined, z.email().max(254).optional()),
  })
  .refine((v) => Boolean(v.shareToken || v.mediaId), { message: "Tell us what you are reporting." });
export type CreateReportRequest = z.infer<typeof createReportRequest>;

interface ReportTarget {
  shareLinkId: string | null;
  mediaId: string | null;
  targetUserId: string | null;
}

async function findMedia(mediaId: string, ownerId?: string) {
  const [row] = await db
    .select({ id: media.id, userId: media.userId, folderId: media.folderId })
    .from(media)
    .where(and(eq(media.id, mediaId), ownerId ? eq(media.userId, ownerId) : undefined, isNull(media.deletedAt)))
    .limit(1);
  return row ?? null;
}

async function resolveFromShare(link: ShareLinkRow, mediaId: string | undefined): Promise<ReportTarget> {
  let reportedMedia = link.mediaId;
  // On a folder share the reporter may point at one item; accept it only if it belongs to that folder.
  if (!reportedMedia && link.folderId && mediaId) {
    const row = await findMedia(mediaId, link.userId);
    if (row?.folderId === link.folderId) reportedMedia = row.id;
  }
  return { shareLinkId: link.id, mediaId: reportedMedia, targetUserId: link.userId };
}

async function resolveTarget(input: CreateReportRequest): Promise<ReportTarget> {
  if (input.shareToken) {
    const link = await findShareByToken(input.shareToken);
    if (link) return resolveFromShare(link, input.mediaId);
  }
  if (input.mediaId) {
    const row = await findMedia(input.mediaId);
    if (row) return { shareLinkId: null, mediaId: row.id, targetUserId: row.userId };
  }
  return { shareLinkId: null, mediaId: null, targetUserId: null };
}

/** Store a report and notify the takedown inbox (+ acknowledge the reporter when they left an email). */
export async function createReport(
  input: CreateReportRequest,
  ctx: { reporterUserId?: string | null } = {},
): Promise<ReportRow> {
  const target = await resolveTarget(input);
  const [row] = await db
    .insert(reports)
    .values({
      ...target,
      reporterUserId: ctx.reporterUserId ?? null,
      reporterEmail: input.email ?? null,
      reason: input.reason,
      details: input.details ?? null,
    })
    .returning();
  const report = row!;
  await Promise.all([
    sendEmailSafe("report_received", APP.takedownEmail, { reportId: report.id }),
    input.email ? sendEmailSafe("report_received", input.email, { reportId: report.id }) : null,
  ]);
  return report;
}
