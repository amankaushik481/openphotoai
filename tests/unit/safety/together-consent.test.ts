/**
 * SAF-12 / SAF-22 regressions: a partner's likeness in a Together photo stays bounded by their consent
 * (active share, owner not suspended), and takedowns cascade to derived media.
 */
import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createTestJob, createTestMedia, createTestModel, createTestUser } from "../../helpers/factories";
import { db } from "@/db";
import { media, modelShares, user as userTable } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { removeMediaTx } from "@/server/admin/moderation";
import { assertGroupConsentActive } from "@/server/jobs/handlers/edit";
import { assertModelsUsable } from "@/server/safety";

let requester: UserRow;
let partner: UserRow;
let partnerModelId: string;
let shareId: string;

beforeEach(async () => {
  await createTestDb();
  requester = await createTestUser();
  partner = await createTestUser();
  const own = await createTestModel(requester.id);
  const partnerModel = await createTestModel(partner.id);
  partnerModelId = partnerModel.id;
  const [share] = await db
    .insert(modelShares)
    .values({
      requesterUserId: requester.id,
      inviteeEmail: partner.email,
      ownerUserId: partner.id,
      modelId: partnerModel.id,
      status: "accepted",
      tokenHash: `hash-${partnerModel.id}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning();
  shareId = share!.id;
  void own;
});

async function togetherPhoto() {
  const job = await createTestJob(requester.id, {
    input: { type: "multi_person", modelIds: ["mdl_a", "mdl_b"], prompt: "two friends", numImages: 1, aspectRatio: "4:5" },
    status: "succeeded",
    output: { plan: { sharedModelIds: [partnerModelId] } },
  } as never);
  const pair = await createTestMedia(requester.id, { jobId: job.id });
  const edited = await createTestMedia(requester.id, { parentMediaId: pair.id });
  return { pair, edited };
}

describe("SAF-12: editing a Together photo requires the partner's share to be active", () => {
  it("is allowed while the share is accepted, refused once it is revoked", async () => {
    const { pair, edited } = await togetherPhoto();
    await expect(assertGroupConsentActive(requester.id, pair)).resolves.toBe(true);
    await expect(assertGroupConsentActive(requester.id, edited)).resolves.toBe(true);
    await db.update(modelShares).set({ status: "revoked" }).where(eq(modelShares.id, shareId));
    await expect(assertGroupConsentActive(requester.id, pair)).rejects.toMatchObject({ code: "forbidden" });
    await expect(assertGroupConsentActive(requester.id, edited)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("solo photos are not affected", async () => {
    const solo = await createTestMedia(requester.id);
    await expect(assertGroupConsentActive(requester.id, solo)).resolves.toBe(false);
  });
});

describe("SAF-22: a suspended owner's model stops working through shares", () => {
  it("refuses the shared model while the owner is suspended", async () => {
    await expect(assertModelsUsable(requester.id, [partnerModelId])).resolves.toHaveLength(1);
    await db.update(userTable).set({ banned: true }).where(eq(userTable.id, partner.id));
    await expect(assertModelsUsable(requester.id, [partnerModelId])).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("SAF-12: takedowns cascade to derived media", () => {
  it("remove_media marks the media and everything derived from it removed", async () => {
    const root = await createTestMedia(requester.id);
    const edit = await createTestMedia(requester.id, { parentMediaId: root.id });
    const upscale = await createTestMedia(requester.id, { parentMediaId: edit.id });
    const video = await createTestMedia(requester.id, { parentMediaId: upscale.id, kind: "video", mimeType: "video/mp4" });
    const unrelated = await createTestMedia(requester.id);
    const { keys } = await removeMediaTx(db, root.id);
    const rows = await db.select({ id: media.id, removedAt: media.removedAt }).from(media).where(inArray(media.id, [root.id, edit.id, upscale.id, video.id, unrelated.id]));
    const removed = new Set(rows.filter((r) => r.removedAt).map((r) => r.id));
    expect(removed).toEqual(new Set([root.id, edit.id, upscale.id, video.id]));
    expect(keys).toContain(video.storageKey);
  });
});
