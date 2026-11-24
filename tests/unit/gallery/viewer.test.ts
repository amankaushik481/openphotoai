import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { folders } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { loadViewerData } from "@/server/gallery/viewer";
import { createTestDb, createTestJob, createTestModel, createTestUser } from "../../helpers/factories";
import { seedMedia } from "./helpers";

let alice: UserRow;
let bob: UserRow;
beforeEach(async () => {
  await createTestDb();
  alice = await createTestUser();
  bob = await createTestUser();
});

describe("loadViewerData", () => {
  it("is null for other users' or deleted media (page 404s)", async () => {
    const theirs = await seedMedia(bob.id, 1);
    const deleted = await seedMedia(alice.id, 2, { deletedAt: new Date() });
    expect(await loadViewerData(alice.id, theirs.id, {})).toBeNull();
    expect(await loadViewerData(alice.id, deleted.id, {})).toBeNull();
    expect(await loadViewerData(alice.id, "med_missing", {})).toBeNull();
  });

  it("finds prev (newer) / next (older) within the same filtered list", async () => {
    const [folder] = await db.insert(folders).values({ userId: alice.id, name: "F" }).returning();
    const a = await seedMedia(alice.id, 1, { folderId: folder!.id });
    await seedMedia(alice.id, 2); // not in the folder
    const b = await seedMedia(alice.id, 3, { folderId: folder!.id, hidden: true });
    const c = await seedMedia(alice.id, 4, { folderId: folder!.id });
    await seedMedia(bob.id, 5);

    const inFolder = await loadViewerData(alice.id, c.id, { folderId: folder!.id });
    expect(inFolder).toMatchObject({ prevId: null, nextId: a.id }); // hidden `b` skipped by default
    const withHidden = await loadViewerData(alice.id, c.id, { folderId: folder!.id, showHidden: true });
    expect(withHidden).toMatchObject({ prevId: null, nextId: b.id });
    const middle = await loadViewerData(alice.id, a.id, { folderId: folder!.id, showHidden: true });
    expect(middle).toMatchObject({ prevId: b.id, nextId: null });
  });

  it("returns lineage, model, pack and job details for the owner only", async () => {
    const model = await createTestModel(alice.id, { name: "Me" });
    const parent = await seedMedia(alice.id, 1, { modelId: model.id });
    const job = await createTestJob(alice.id, { type: "upscale", input: { type: "upscale", sourceMediaId: parent.id, scale: 2, faceRestore: false } });
    const child = await seedMedia(alice.id, 2, { parentMediaId: parent.id, jobId: job.id, modelId: model.id, seed: 42 });
    // A row pointing at someone else's media as parent doesn't reveal it.
    const foreign = await seedMedia(bob.id, 3);
    const sneaky = await seedMedia(alice.id, 4, { parentMediaId: foreign.id });

    const data = await loadViewerData(alice.id, child.id, {});
    expect(data?.parent?.id).toBe(parent.id);
    expect(data?.details).toMatchObject({ modelName: "Me", jobType: "upscale", seed: 42 });
    expect((await loadViewerData(alice.id, parent.id, {}))?.children.map((m) => m.id)).toEqual([child.id]);
    expect((await loadViewerData(alice.id, sneaky.id, {}))?.parent).toBeNull();
  });
});
