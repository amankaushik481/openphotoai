import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as deleteFolderRoute, PATCH as renameFolderRoute } from "@/app/api/folders/[id]/route";
import { GET as listFoldersRoute, POST as createFolderRoute } from "@/app/api/folders/route";
import { POST as reportRoute } from "@/app/api/reports/route";
import { DELETE as revokeShareRoute } from "@/app/api/share/[id]/route";
import { GET as listSharesRoute, POST as createShareRoute } from "@/app/api/share/route";
import { RATE_LIMITS } from "@/config/rate-limits";
import { db } from "@/db";
import { folders, media, reports, shareLinks } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { FOLDER_NAME_MAX, MAX_FOLDERS } from "@/server/gallery/dto";
import { incrementShareViews, resolveShare } from "@/server/gallery/share";
import { callRoute, createTestDb, createTestUser, sessionMock } from "../../helpers/factories";
import { seedMedia, useTempStorage } from "./helpers";

vi.mock("@/server/auth/session", () => sessionMock);
const sendEmailSafe = vi.hoisted(() => vi.fn(async () => ({ id: "eml_test", status: "mocked" as const })));
vi.mock("@/server/email", () => ({ sendEmailSafe }));

let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
});
afterAll(async () => {
  await cleanup();
});

let alice: UserRow;
let bob: UserRow;
beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
  sendEmailSafe.mockClear();
  alice = await createTestUser({ name: "Alice" });
  bob = await createTestUser({ name: "Bob" });
  sessionMock.setUser(alice);
});

const createFolder = (name: unknown) => callRoute(createFolderRoute, { url: "/api/folders", body: { name } });

describe("folders", () => {
  it("creates, lists with counts, renames and deletes (keeping media)", async () => {
    const created = await createFolder("  Linked   In  ");
    expect(created.status).toBe(200);
    const folder = created.json.folder;
    expect(folder.name).toBe("Linked In");
    const m = await seedMedia(alice.id, 1, { folderId: folder.id });
    await seedMedia(alice.id, 2, { folderId: folder.id, deletedAt: new Date() });

    const listed = await callRoute(listFoldersRoute, { url: "/api/folders" });
    expect(listed.json.folders).toEqual([expect.objectContaining({ id: folder.id, mediaCount: 1 })]);

    const renamed = await callRoute(renameFolderRoute, {
      method: "PATCH",
      url: `/api/folders/${folder.id}`,
      params: { id: folder.id },
      body: { name: "Headshots" },
    });
    expect(renamed.json.folder).toMatchObject({ name: "Headshots", mediaCount: 1 });

    const deleted = await callRoute(deleteFolderRoute, { method: "DELETE", url: `/api/folders/${folder.id}`, params: { id: folder.id } });
    expect(deleted.status).toBe(200);
    expect(await db.select().from(folders)).toHaveLength(0);
    const [kept] = await db.select().from(media).where(eq(media.id, m.id));
    expect(kept).toMatchObject({ id: m.id, folderId: null });
  });

  it("validates names and caps the folder count", async () => {
    expect((await createFolder("")).status).toBe(400);
    expect((await createFolder("   ")).status).toBe(400);
    expect((await createFolder("x".repeat(FOLDER_NAME_MAX + 1))).status).toBe(400);
    expect((await createFolder("x".repeat(FOLDER_NAME_MAX))).status).toBe(200);

    await db.insert(folders).values(Array.from({ length: MAX_FOLDERS - 1 }, (_, i) => ({ userId: alice.id, name: `F${i}` })));
    const over = await createFolder("one too many");
    expect(over.status).toBe(403);
    expect(over.json.error.code).toBe("plan_limit");
    // Other users are unaffected.
    sessionMock.setUser(bob);
    expect((await createFolder("Bob's")).status).toBe(200);
  });

  it("refuses other users' folders (404) and only lists your own", async () => {
    const [bobFolder] = await db.insert(folders).values({ userId: bob.id, name: "Private" }).returning();
    const rename = await callRoute(renameFolderRoute, {
      method: "PATCH",
      url: `/api/folders/${bobFolder!.id}`,
      params: { id: bobFolder!.id },
      body: { name: "Mine now" },
    });
    expect(rename.status).toBe(404);
    const del = await callRoute(deleteFolderRoute, { method: "DELETE", url: `/api/folders/${bobFolder!.id}`, params: { id: bobFolder!.id } });
    expect(del.status).toBe(404);
    expect((await callRoute(listFoldersRoute, { url: "/api/folders" })).json.folders).toEqual([]);
    const [still] = await db.select().from(folders).where(eq(folders.id, bobFolder!.id));
    expect(still?.name).toBe("Private");
  });
});

describe("share links", () => {
  const share = (body: unknown) => callRoute(createShareRoute, { url: "/api/share", body });

  it("creates a link for own media, resolves it publicly, counts views and revokes", async () => {
    const m = await seedMedia(alice.id, 1);
    const res = await share({ mediaId: m.id });
    expect(res.status).toBe(200);
    const { id, token, url } = res.json.share;
    expect(token).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(url).toBe(`http://localhost:3000/s/${token}`);

    const resolved = await resolveShare(token);
    expect(resolved?.media.map((r) => r.id)).toEqual([m.id]);
    await incrementShareViews(resolved!.link.id);
    await incrementShareViews(resolved!.link.id);
    const listed = await callRoute(listSharesRoute, { url: `/api/share?mediaId=${m.id}` });
    expect(listed.json.shares).toEqual([expect.objectContaining({ id, url, views: 2, expiresAt: null })]);

    // Other users can't revoke it.
    sessionMock.setUser(bob);
    expect((await callRoute(revokeShareRoute, { method: "DELETE", url: `/api/share/${id}`, params: { id } })).status).toBe(404);
    expect(await resolveShare(token)).not.toBeNull();

    sessionMock.setUser(alice);
    expect((await callRoute(revokeShareRoute, { method: "DELETE", url: `/api/share/${id}`, params: { id } })).status).toBe(200);
    expect(await resolveShare(token)).toBeNull();
    expect((await callRoute(listSharesRoute, { url: `/api/share?mediaId=${m.id}` })).json.shares).toEqual([]);
    // Revoking twice is fine.
    expect((await callRoute(revokeShareRoute, { method: "DELETE", url: `/api/share/${id}`, params: { id } })).status).toBe(200);
  });

  it("refuses sharing other users' media or folders (404)", async () => {
    const theirs = await seedMedia(bob.id, 1);
    const [bobFolder] = await db.insert(folders).values({ userId: bob.id, name: "B" }).returning();
    expect((await share({ mediaId: theirs.id })).status).toBe(404);
    expect((await share({ folderId: bobFolder!.id })).status).toBe(404);
    expect((await share({})).status).toBe(400);
    expect((await share({ mediaId: theirs.id, folderId: bobFolder!.id })).status).toBe(400);
    expect(await db.select().from(shareLinks)).toHaveLength(0);
  });

  it("404s expired links and deleted/removed media", async () => {
    const m = await seedMedia(alice.id, 1);
    const expiring = (await share({ mediaId: m.id, expiresInDays: 1 })).json.share;
    expect(new Date(expiring.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(await resolveShare(expiring.token)).not.toBeNull();
    await db.update(shareLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(shareLinks.id, expiring.id));
    expect(await resolveShare(expiring.token)).toBeNull();

    const live = (await share({ mediaId: m.id })).json.share;
    await db.update(media).set({ removedAt: new Date() }).where(eq(media.id, m.id));
    expect(await resolveShare(live.token)).toBeNull();

    expect(await resolveShare("not-a-token")).toBeNull();
    expect(await resolveShare("A".repeat(32))).toBeNull();
  });

  it("shares a folder without its hidden shots", async () => {
    const [folder] = await db.insert(folders).values({ userId: alice.id, name: "Trip" }).returning();
    const shown = await seedMedia(alice.id, 1, { folderId: folder!.id });
    await seedMedia(alice.id, 2, { folderId: folder!.id, hidden: true });
    await seedMedia(alice.id, 3);
    const link = (await share({ folderId: folder!.id })).json.share;
    const resolved = await resolveShare(link.token);
    expect(resolved?.folderName).toBe("Trip");
    expect(resolved?.media.map((r) => r.id)).toEqual([shown.id]);

    // Deleting the folder takes its links with it.
    await callRoute(deleteFolderRoute, { method: "DELETE", url: `/api/folders/${folder!.id}`, params: { id: folder!.id } });
    expect(await resolveShare(link.token)).toBeNull();
  });
});

describe("POST /api/reports", () => {
  const report = (body: unknown, ip = "203.0.113.7") =>
    callRoute(reportRoute, { url: "/api/reports", body, headers: { "x-forwarded-for": ip } });

  it("stores the report with the owner as targetUserId and notifies takedown + reporter", async () => {
    const m = await seedMedia(alice.id, 1);
    const link = (await callRoute(createShareRoute, { url: "/api/share", body: { mediaId: m.id } })).json.share;
    sessionMock.setUser(null);

    const res = await report({ shareToken: link.token, reason: "non_consensual", details: "This is me", email: "victim@example.com" });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
    const [row] = await db.select().from(reports);
    expect(row).toMatchObject({
      shareLinkId: link.id,
      mediaId: m.id,
      targetUserId: alice.id,
      reporterUserId: null,
      reporterEmail: "victim@example.com",
      reason: "non_consensual",
      details: "This is me",
      status: "open",
    });
    expect(sendEmailSafe).toHaveBeenCalledWith("report_received", "takedown@example.com", { reportId: row!.id });
    expect(sendEmailSafe).toHaveBeenCalledWith("report_received", "victim@example.com", { reportId: row!.id });
  });

  it("resolves the owner from a media id or a folder share, and records signed-in reporters", async () => {
    const m = await seedMedia(alice.id, 1);
    sessionMock.setUser(bob);
    expect((await report({ mediaId: m.id, reason: "impersonation", email: "" })).status).toBe(200);
    const [byMedia] = await db.select().from(reports);
    expect(byMedia).toMatchObject({ mediaId: m.id, targetUserId: alice.id, reporterUserId: bob.id, reporterEmail: null });
    expect(sendEmailSafe).toHaveBeenCalledTimes(1);

    await db.delete(reports);
    sessionMock.setUser(alice);
    const [folder] = await db.insert(folders).values({ userId: alice.id, name: "F" }).returning();
    const inFolder = await seedMedia(alice.id, 2, { folderId: folder!.id });
    const link = (await callRoute(createShareRoute, { url: "/api/share", body: { folderId: folder!.id } })).json.share;
    sessionMock.setUser(null);
    // A media id outside the shared folder is not attached to the report.
    await report({ shareToken: link.token, mediaId: m.id, reason: "other" });
    await report({ shareToken: link.token, mediaId: inFolder.id, reason: "harassment" });
    const rows = await db.select().from(reports);
    expect(rows.find((r) => r.reason === "other")).toMatchObject({ mediaId: null, targetUserId: alice.id, shareLinkId: link.id });
    expect(rows.find((r) => r.reason === "harassment")).toMatchObject({ mediaId: inFolder.id, targetUserId: alice.id });
  });

  it("answers ok for unknown targets without leaking existence", async () => {
    sessionMock.setUser(null);
    expect((await report({ mediaId: "med_nope", reason: "other" })).status).toBe(200);
    expect((await report({ shareToken: "Z".repeat(32), reason: "other" })).status).toBe(200);
    const rows = await db.select().from(reports);
    expect(rows.every((r) => r.targetUserId === null && r.mediaId === null && r.shareLinkId === null)).toBe(true);
  });

  it("validates the body", async () => {
    sessionMock.setUser(null);
    expect((await report({ reason: "other" })).status).toBe(400);
    expect((await report({ mediaId: "med_1", reason: "spam" })).status).toBe(400);
    expect((await report({ mediaId: "med_1", reason: "other", details: "x".repeat(2001) })).status).toBe(400);
    expect((await report({ mediaId: "med_1", reason: "other", email: "not-an-email" })).status).toBe(400);
    expect(await db.select().from(reports)).toHaveLength(0);
  });

  it("rate-limits by IP, even for signed-in reporters", async () => {
    const { limit } = RATE_LIMITS.reportsPerHourPerIp;
    sessionMock.setUser(bob);
    for (let i = 0; i < limit; i++) expect((await report({ mediaId: "med_x", reason: "other" })).status).toBe(200);
    const blocked = await report({ mediaId: "med_x", reason: "other" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    // Another IP still works; switching accounts on the same IP doesn't.
    expect((await report({ mediaId: "med_x", reason: "other" }, "198.51.100.1")).status).toBe(200);
    sessionMock.setUser(alice);
    expect((await report({ mediaId: "med_x", reason: "other" })).status).toBe(429);
    expect(await db.select().from(reports)).toHaveLength(limit + 1);
  });
});
