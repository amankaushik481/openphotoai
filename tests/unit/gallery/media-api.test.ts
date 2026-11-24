import { eq } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as bulkRoute } from "@/app/api/media/bulk/route";
import { POST as downloadRoute } from "@/app/api/media/download/route";
import { DELETE as deleteMediaRoute, GET as getMediaRoute, PATCH as patchMediaRoute } from "@/app/api/media/[id]/route";
import { GET as listMediaRoute } from "@/app/api/media/route";
import { db } from "@/db";
import { folders, media, shareLinks } from "@/db/schema";
import type { UserRow } from "@/db/types";
import type { LocalStorageProvider } from "@/providers/storage/local";
import { RATE_LIMITS } from "@/config/rate-limits";
import { MAX_BULK_IDS } from "@/server/gallery/dto";
import { zipEntryName } from "@/server/gallery/zip";
import { callRoute, createTestDb, createTestModel, createTestUser, sessionMock } from "../../helpers/factories";
import { bytesFor, seedMedia, useTempStorage } from "./helpers";

vi.mock("@/server/auth/session", () => sessionMock);

let storage: LocalStorageProvider;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ storage, cleanup } = await useTempStorage());
});
afterAll(async () => {
  await cleanup();
});

let alice: UserRow;
let bob: UserRow;
beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
  alice = await createTestUser({ name: "Alice" });
  bob = await createTestUser({ name: "Bob" });
  sessionMock.setUser(alice);
});

const list = (query = "") => callRoute(listMediaRoute, { url: `/api/media${query ? `?${query}` : ""}` });
const ids = (res: { json: { media: { id: string }[] } }) => res.json.media.map((m) => m.id);

describe("GET /api/media", () => {
  it("requires auth", async () => {
    sessionMock.setUser(null);
    expect((await list()).status).toBe(401);
  });

  it("pages newest first with a stable cursor and only the user's visible media", async () => {
    const rows = [];
    for (let i = 0; i < 5; i++) rows.push(await seedMedia(alice.id, i));
    // Same timestamp: id breaks the tie.
    const twin = await seedMedia(alice.id, 4);
    await seedMedia(bob.id, 10);
    await seedMedia(alice.id, 11, { deletedAt: new Date() });
    await seedMedia(alice.id, 12, { removedAt: new Date() });

    const expected = [rows[4]!, twin, rows[3]!, rows[2]!, rows[1]!, rows[0]!]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .map((r) => r.id);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await list(`limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      expect(res.status).toBe(200);
      seen.push(...ids(res));
      cursor = res.json.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(seen).toEqual(expected);
    expect(pages).toBe(3);

    const first = await list();
    expect(first.json.media[0]).toMatchObject({ id: expected[0], kind: "image" });
    expect(first.json.media[0].url).toContain("/api/files/");
  });

  it("hides best-shots-hidden media by default and reports how many", async () => {
    const visible = await seedMedia(alice.id, 1);
    const hidden = await seedMedia(alice.id, 2, { hidden: true });
    await seedMedia(alice.id, 3, { hidden: true, kind: "video", mimeType: "video/mp4" });

    const def = await list();
    expect(ids(def)).toEqual([visible.id]);
    expect(def.json.hiddenCount).toBe(2);

    const all = await list("showHidden=true");
    expect(ids(all)).toHaveLength(3);
    expect(all.json.hiddenCount).toBe(2);

    // hiddenCount follows the other filters.
    const images = await list("kind=image");
    expect(images.json.hiddenCount).toBe(1);
    expect(ids(await list("kind=image&showHidden=1"))).toEqual([hidden.id, visible.id]);
  });

  it("filters by favorite, kind, folder, model, pack and batch", async () => {
    const model = await createTestModel(alice.id);
    const [folder] = await db.insert(folders).values({ userId: alice.id, name: "Picks" }).returning();
    const fav = await seedMedia(alice.id, 1, { isFavorite: true });
    const video = await seedMedia(alice.id, 2, { kind: "video", mimeType: "video/mp4" });
    const inFolder = await seedMedia(alice.id, 3, { folderId: folder!.id });
    const byModel = await seedMedia(alice.id, 4, { modelId: model.id });
    const byPack = await seedMedia(alice.id, 5, { packId: "linkedin-headshots", batchId: "bat_1" });

    expect(ids(await list("favorite=true"))).toEqual([fav.id]);
    expect(ids(await list("favorite=false"))).not.toContain(fav.id);
    expect(ids(await list("kind=video"))).toEqual([video.id]);
    expect(ids(await list(`folderId=${folder!.id}`))).toEqual([inFolder.id]);
    expect(ids(await list(`modelId=${model.id}`))).toEqual([byModel.id]);
    expect(ids(await list("packId=linkedin-headshots"))).toEqual([byPack.id]);
    expect(ids(await list("batchId=bat_1"))).toEqual([byPack.id]);
    // Another user's folder id simply matches nothing.
    const [bobFolder] = await db.insert(folders).values({ userId: bob.id, name: "Bob" }).returning();
    await seedMedia(bob.id, 6, { folderId: bobFolder!.id });
    expect(ids(await list(`folderId=${bobFolder!.id}`))).toEqual([]);
  });

  it("validates the query", async () => {
    expect((await list("limit=101")).status).toBe(400);
    expect((await list("kind=gif")).status).toBe(400);
    expect((await list("cursor=not-a-cursor")).status).toBe(400);
  });
});

describe("/api/media/:id", () => {
  it("reads, patches and refuses other users' media (404)", async () => {
    const mine = await seedMedia(alice.id, 1);
    const theirs = await seedMedia(bob.id, 2);
    const [folder] = await db.insert(folders).values({ userId: alice.id, name: "A" }).returning();
    const [bobFolder] = await db.insert(folders).values({ userId: bob.id, name: "B" }).returning();

    const got = await callRoute(getMediaRoute, { url: `/api/media/${mine.id}`, params: { id: mine.id } });
    expect(got.status).toBe(200);
    expect(got.json.media.id).toBe(mine.id);

    const patched = await callRoute(patchMediaRoute, {
      method: "PATCH",
      url: `/api/media/${mine.id}`,
      params: { id: mine.id },
      body: { isFavorite: true, folderId: folder!.id, hidden: true },
    });
    expect(patched.status).toBe(200);
    expect(patched.json.media).toMatchObject({ isFavorite: true, folderId: folder!.id, hidden: true });

    const unfiled = await callRoute(patchMediaRoute, {
      method: "PATCH",
      url: `/api/media/${mine.id}`,
      params: { id: mine.id },
      body: { folderId: null },
    });
    expect(unfiled.json.media.folderId).toBeNull();

    // Moving into someone else's folder is a 404 (folder), not a silent success.
    const foreignFolder = await callRoute(patchMediaRoute, {
      method: "PATCH",
      url: `/api/media/${mine.id}`,
      params: { id: mine.id },
      body: { folderId: bobFolder!.id },
    });
    expect(foreignFolder.status).toBe(404);

    for (const [handler, method, body] of [
      [getMediaRoute, "GET", undefined],
      [patchMediaRoute, "PATCH", { isFavorite: true }],
      [deleteMediaRoute, "DELETE", undefined],
    ] as const) {
      const res = await callRoute(handler, { method, url: `/api/media/${theirs.id}`, params: { id: theirs.id }, body });
      expect(res.status).toBe(404);
    }
    const [bobRow] = await db.select().from(media).where(eq(media.id, theirs.id));
    expect(bobRow).toMatchObject({ isFavorite: false });

    const empty = await callRoute(patchMediaRoute, {
      method: "PATCH",
      url: `/api/media/${mine.id}`,
      params: { id: mine.id },
      body: {},
    });
    expect(empty.status).toBe(400);
  });

  it("DELETE removes storage objects, share links and the row", async () => {
    const row = await seedMedia(alice.id, 1, {}, { storage });
    await db.insert(shareLinks).values({ token: "tok".padEnd(32, "x"), userId: alice.id, mediaId: row.id });
    expect(await storage.exists(row.storageKey)).toBe(true);
    expect(await storage.exists(row.thumbKey!)).toBe(true);

    const res = await callRoute(deleteMediaRoute, {
      method: "DELETE",
      url: `/api/media/${row.id}`,
      params: { id: row.id },
    });
    expect(res.status).toBe(200);
    expect(await storage.exists(row.storageKey)).toBe(false);
    expect(await storage.exists(row.thumbKey!)).toBe(false);
    expect(await db.select().from(media).where(eq(media.id, row.id))).toHaveLength(0);
    expect(await db.select().from(shareLinks).where(eq(shareLinks.mediaId, row.id))).toHaveLength(0);

    const again = await callRoute(deleteMediaRoute, {
      method: "DELETE",
      url: `/api/media/${row.id}`,
      params: { id: row.id },
    });
    expect(again.status).toBe(404);
  });
});

describe("POST /api/media/bulk", () => {
  const bulk = (body: unknown) => callRoute(bulkRoute, { url: "/api/media/bulk", body });

  it("applies favorite / move / hide / unhide / unfavorite", async () => {
    const a = await seedMedia(alice.id, 1);
    const b = await seedMedia(alice.id, 2);
    const [folder] = await db.insert(folders).values({ userId: alice.id, name: "F" }).returning();

    expect((await bulk({ action: "favorite", ids: [a.id, b.id] })).json.updated).toBe(2);
    expect((await bulk({ action: "move", ids: [a.id], folderId: folder!.id })).json.updated).toBe(1);
    expect((await bulk({ action: "hide", ids: [b.id] })).json.updated).toBe(1);
    let rows = await db.select().from(media);
    expect(rows.find((r) => r.id === a.id)).toMatchObject({ isFavorite: true, folderId: folder!.id, hidden: false });
    expect(rows.find((r) => r.id === b.id)).toMatchObject({ isFavorite: true, folderId: null, hidden: true });

    await bulk({ action: "unhide", ids: [b.id] });
    await bulk({ action: "unfavorite", ids: [a.id, b.id] });
    await bulk({ action: "move", ids: [a.id], folderId: null });
    rows = await db.select().from(media);
    expect(rows.every((r) => !r.isFavorite && !r.hidden && r.folderId === null)).toBe(true);
  });

  it("deletes with storage cleanup", async () => {
    const a = await seedMedia(alice.id, 1, {}, { storage });
    const b = await seedMedia(alice.id, 2, {}, { storage });
    const res = await bulk({ action: "delete", ids: [a.id, b.id] });
    expect(res.json.updated).toBe(2);
    expect(await db.select().from(media)).toHaveLength(0);
    for (const r of [a, b]) expect(await storage.exists(r.storageKey)).toBe(false);
  });

  it("is all-or-nothing: any foreign or missing id is a 404 and changes nothing", async () => {
    const mine = await seedMedia(alice.id, 1, {}, { storage });
    const theirs = await seedMedia(bob.id, 2, {}, { storage });
    for (const action of ["favorite", "hide", "delete"] as const) {
      const res = await bulk({ action, ids: [mine.id, theirs.id] });
      expect(res.status).toBe(404);
    }
    expect((await bulk({ action: "favorite", ids: [mine.id, "med_missing"] })).status).toBe(404);
    const rows = await db.select().from(media);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !r.isFavorite && !r.hidden)).toBe(true);
    expect(await storage.exists(theirs.storageKey)).toBe(true);
    expect(await storage.exists(mine.storageKey)).toBe(true);

    const [bobFolder] = await db.insert(folders).values({ userId: bob.id, name: "B" }).returning();
    expect((await bulk({ action: "move", ids: [mine.id], folderId: bobFolder!.id })).status).toBe(404);
  });

  it("enforces limits and shape", async () => {
    const tooMany = Array.from({ length: MAX_BULK_IDS + 1 }, (_, i) => `med_${i}`);
    expect((await bulk({ action: "favorite", ids: tooMany })).status).toBe(400);
    expect((await bulk({ action: "favorite", ids: [] })).status).toBe(400);
    expect((await bulk({ action: "explode", ids: ["med_1"] })).status).toBe(400);
    expect((await bulk({ action: "move", ids: ["med_1"] })).status).toBe(400);
  });
});

describe("POST /api/media/download", () => {
  async function readZip(res: { response: Response }) {
    return unzipSync(new Uint8Array(await res.response.arrayBuffer()));
  }

  it("streams a valid zip with one uncompressed entry per item", async () => {
    const a = await seedMedia(alice.id, 1, {}, { storage });
    const v = await seedMedia(alice.id, 2, { kind: "video", mimeType: "video/mp4" }, { storage });
    const res = await callRoute(downloadRoute, { url: "/api/media/download", body: { ids: [a.id, v.id] } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="openshoot-\d{4}-\d{2}-\d{2}\.zip"$/);

    const files = await readZip(res);
    expect(Object.keys(files).sort()).toEqual([zipEntryName(a), zipEntryName(v)].sort());
    expect(zipEntryName(a)).toBe(`openshoot-2026-11-01-${a.id}.jpg`);
    expect(zipEntryName(v)).toMatch(/\.mp4$/);
    expect(strFromU8(files[zipEntryName(a)]!)).toBe(strFromU8(bytesFor(a.id)));
  });

  it("accepts a same-origin form POST and rejects a cross-site one", async () => {
    const a = await seedMedia(alice.id, 1, {}, { storage });
    const b = await seedMedia(alice.id, 2, {}, { storage });
    const form = new URLSearchParams({ ids: `${a.id},${b.id}` });
    const ok = await callRoute(downloadRoute, {
      url: "/api/media/download",
      body: form.toString(),
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost:3000" },
    });
    expect(ok.status).toBe(200);
    expect(Object.keys(await readZip(ok))).toHaveLength(2);

    const evil = await callRoute(downloadRoute, {
      url: "/api/media/download",
      body: form.toString(),
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example" },
    });
    expect(evil.status).toBe(403);
  });

  it("is rate limited per user (downloadsPerHour), not counting rejected cross-site posts", async () => {
    const a = await seedMedia(alice.id, 1, {}, { storage });
    const { limit } = RATE_LIMITS.downloadsPerHour;
    const form = new URLSearchParams({ ids: a.id }).toString();
    const evil = await callRoute(downloadRoute, {
      url: "/api/media/download",
      body: form,
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example" },
    });
    expect(evil.status).toBe(403);
    for (let i = 0; i < limit; i++) {
      const res = await callRoute(downloadRoute, { url: "/api/media/download", body: { ids: [a.id] } });
      expect(res.status).toBe(200);
      await res.response.arrayBuffer();
    }
    expect((await callRoute(downloadRoute, { url: "/api/media/download", body: { ids: [a.id] } })).status).toBe(429);
  });

  it("404s on other users' media and validates the id count", async () => {
    const mine = await seedMedia(alice.id, 1, {}, { storage });
    const theirs = await seedMedia(bob.id, 2, {}, { storage });
    const res = await callRoute(downloadRoute, { url: "/api/media/download", body: { ids: [mine.id, theirs.id] } });
    expect(res.status).toBe(404);
    const tooMany = Array.from({ length: MAX_BULK_IDS + 1 }, (_, i) => `med_${i}`);
    expect((await callRoute(downloadRoute, { url: "/api/media/download", body: { ids: tooMany } })).status).toBe(400);
    sessionMock.setUser(null);
    expect((await callRoute(downloadRoute, { url: "/api/media/download", body: { ids: [mine.id] } })).status).toBe(401);
  });
});
