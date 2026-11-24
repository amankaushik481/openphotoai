import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { media, moderationEvents, reports, session, shareLinks, user } from "@/db/schema";
import type { MediaRow, UserRow } from "@/db/types";
import { createLocalStorage } from "@/providers/storage/local";
import { listModerationQueue, markEventReviewed, resolveReport } from "@/server/admin";
import { getStorage, setStorageForTesting } from "@/server/storage";
import { createTestDb, createTestMedia, createTestUser } from "../../helpers/factories";
import { createModerationEvent, createReport, createSession, createShareLink } from "./fixtures";

const email = vi.hoisted(() => ({ sendEmailSafe: vi.fn(async () => null) }));
vi.mock("@/server/email", () => email);

let tmpDir: string;
beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-admin-"));
  setStorageForTesting(createLocalStorage({ dir: tmpDir, baseUrl: "http://localhost:3000", secret: "admin-test-secret" }));
});
afterAll(async () => {
  setStorageForTesting(null);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

let admin: UserRow;
let owner: UserRow;
let photo: MediaRow;

beforeEach(async () => {
  await createTestDb();
  email.sendEmailSafe.mockClear();
  admin = await createTestUser({ role: "admin" });
  owner = await createTestUser({ email: "owner@example.com" });
  photo = await createTestMedia(owner.id);
  const storage = getStorage();
  await storage.put(photo.storageKey, new Uint8Array([1, 2, 3]), { contentType: "image/jpeg" });
  await storage.put(photo.thumbKey!, new Uint8Array([4, 5]), { contentType: "image/webp" });
});

const reportRow = async (id: string) => (await db.select().from(reports).where(eq(reports.id, id)))[0]!;
const actionedEvents = async () => db.select().from(moderationEvents).where(eq(moderationEvents.kind, "report_actioned"));

describe("listModerationQueue", () => {
  it("returns open reports with a signed thumbnail and unreviewed events, newest first", async () => {
    const link = await createShareLink(owner.id, { mediaId: photo.id });
    const older = await createReport({ targetUserId: owner.id, mediaId: photo.id, shareLinkId: link.id, createdAt: new Date(Date.now() - 60_000) });
    const newer = await createReport({ targetUserId: owner.id, reason: "harassment" });
    await createReport({ targetUserId: owner.id, status: "dismissed" });
    const event = await createModerationEvent({ userId: owner.id, kind: "output_blocked", details: { categories: ["sexual"] } });
    await createModerationEvent({ userId: owner.id, reviewed: true });

    const queue = await listModerationQueue();
    expect(queue.reports.map((r) => r.id)).toEqual([newer.id, older.id]);
    const withMedia = queue.reports[1]!;
    expect(withMedia.target).toMatchObject({ id: owner.id, email: "owner@example.com", banned: false });
    expect(withMedia.media).toMatchObject({ id: photo.id, kind: "image", removedAt: null });
    expect(withMedia.media!.thumbUrl).toMatch(/^http:\/\/localhost:3000\/api\/files\/.+sig=/);
    expect(withMedia.shareLink).toMatchObject({ id: link.id, token: link.token });
    expect(queue.reports[0]!.media).toBeNull();

    expect(queue.events).toHaveLength(1);
    expect(queue.events[0]).toMatchObject({ id: event.id, kind: "output_blocked", userEmail: "owner@example.com" });
  });
});

describe("resolveReport", () => {
  it("dismiss closes the report without touching the user or media", async () => {
    const report = await createReport({ targetUserId: owner.id, mediaId: photo.id });
    const result = await resolveReport(admin.id, report.id, "dismiss", "Not a match");
    expect(result.report).toMatchObject({ status: "dismissed", resolvedBy: admin.id, resolution: "dismiss: Not a match" });
    expect((await db.select().from(media).where(eq(media.id, photo.id)))[0]!.removedAt).toBeNull();
    expect(await getStorage().exists(photo.storageKey)).toBe(true);
    const events = await actionedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ userId: owner.id, reviewed: true });
    expect(events[0]!.details).toMatchObject({ reportId: report.id, action: "dismiss", adminId: admin.id });
  });

  it("remove_media marks the media removed, deletes its objects and revokes its share links", async () => {
    const link = await createShareLink(owner.id, { mediaId: photo.id });
    const otherPhoto = await createTestMedia(owner.id);
    const otherLink = await createShareLink(owner.id, { mediaId: otherPhoto.id });
    const report = await createReport({ targetUserId: owner.id, mediaId: photo.id, shareLinkId: link.id });

    const result = await resolveReport(admin.id, report.id, "remove_media", "");
    expect(result).toMatchObject({ action: "remove_media", mediaRemoved: true, shareLinksRevoked: 1 });
    expect(result.report.status).toBe("actioned");

    const [row] = await db.select().from(media).where(eq(media.id, photo.id));
    expect(row!.removedAt).toBeInstanceOf(Date);
    expect(await getStorage().exists(photo.storageKey)).toBe(false);
    expect(await getStorage().exists(photo.thumbKey!)).toBe(false);
    const links = Object.fromEntries((await db.select().from(shareLinks)).map((l) => [l.id, l.revokedAt]));
    expect(links[link.id]).toBeInstanceOf(Date);
    expect(links[otherLink.id]).toBeNull();
    // The owner is not suspended by a takedown.
    expect((await db.select().from(user).where(eq(user.id, owner.id)))[0]!.banned).toBe(false);
    expect((await actionedEvents())[0]!.details).toMatchObject({ action: "remove_media", mediaId: photo.id });
  });

  it("remove_media on a folder share report revokes the share link", async () => {
    const link = await createShareLink(owner.id);
    const report = await createReport({ targetUserId: owner.id, shareLinkId: link.id });
    const result = await resolveReport(admin.id, report.id, "remove_media");
    expect(result).toMatchObject({ mediaRemoved: false, shareLinksRevoked: 1 });
  });

  it("suspend_user suspends the owner with the note as reason", async () => {
    await createSession(owner.id);
    const report = await createReport({ targetUserId: owner.id, mediaId: photo.id });
    const result = await resolveReport(admin.id, report.id, "suspend_user", "Repeated non-consensual uploads");
    expect(result.suspension).toMatchObject({ suspended: true, sessionsDeleted: 1 });
    expect((await db.select().from(user).where(eq(user.id, owner.id)))[0]).toMatchObject({
      banned: true,
      banReason: "Repeated non-consensual uploads",
    });
    expect(await db.select().from(session).where(eq(session.userId, owner.id))).toHaveLength(0);
    const kinds = (await db.select().from(moderationEvents)).map((e) => e.kind).sort();
    expect(kinds).toEqual(["account_suspended", "report_actioned"]);
    expect(email.sendEmailSafe).toHaveBeenCalledWith(
      "account_suspended",
      "owner@example.com",
      { reason: "Repeated non-consensual uploads" },
      { userId: owner.id },
    );
  });

  it("refuses to suspend an admin and leaves the report open", async () => {
    const otherAdmin = await createTestUser({ role: "admin" });
    const report = await createReport({ targetUserId: otherAdmin.id });
    await expect(resolveReport(admin.id, report.id, "suspend_user", "x")).rejects.toMatchObject({ code: "forbidden" });
    expect((await reportRow(report.id)).status).toBe("open");
    expect(await actionedEvents()).toHaveLength(0);
  });

  it("rejects already-resolved and unknown reports", async () => {
    const report = await createReport({ targetUserId: owner.id });
    await resolveReport(admin.id, report.id, "dismiss");
    await expect(resolveReport(admin.id, report.id, "remove_media")).rejects.toMatchObject({ code: "conflict" });
    await expect(resolveReport(admin.id, "rpt_missing", "dismiss")).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects remove_media when the report has nothing to remove", async () => {
    const report = await createReport({ targetUserId: owner.id });
    await expect(resolveReport(admin.id, report.id, "remove_media")).rejects.toMatchObject({ code: "validation_error" });
    expect((await reportRow(report.id)).status).toBe("open");
  });
});

describe("markEventReviewed", () => {
  it("marks the event reviewed and records the reviewer", async () => {
    const event = await createModerationEvent({ userId: owner.id, details: { excerpt: "x" } });
    const row = await markEventReviewed(admin.id, event.id);
    expect(row.reviewed).toBe(true);
    expect(row.details).toMatchObject({ excerpt: "x", reviewedBy: admin.id, reviewedAt: expect.any(String) });
    expect((await listModerationQueue()).events).toHaveLength(0);
    await expect(markEventReviewed(admin.id, "mev_missing")).rejects.toMatchObject({ code: "not_found" });
  });
});
