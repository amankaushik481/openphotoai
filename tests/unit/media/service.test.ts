import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { media } from "@/db/schema";
import { createMockAIProvider } from "@/providers/mock/ai";
import { setProviderOverrides } from "@/providers/registry";
import type { StorageProvider } from "@/providers/types";
import {
  getOwnedMedia,
  getOwnedUpload,
  ingestVideos,
  providerInputUrl,
  toMediaDTO,
} from "@/server/media/service";
import { readVideoAiLabel } from "@/server/images/process";
import { getStorage, setStorageForTesting } from "@/server/storage";
import {
  createTestDb,
  createTestJob,
  createTestMedia,
  createTestModel,
  createTestUpload,
  createTestUser,
} from "../../helpers/factories";
import { pngBytes, resetSafety, safetyMock, useTempStorage } from "../jobs/fixtures";

vi.mock("@/server/safety", async () => (await import("../jobs/fixtures")).safetyMock);
vi.mock("@/providers/registry", async (importOriginal) =>
  importOriginal().catch(async () => (await import("../jobs/registry-fallback")).fallbackRegistry),
);

let cleanupStorage: () => Promise<void>;
beforeAll(async () => {
  cleanupStorage = await useTempStorage();
});
afterAll(async () => {
  await cleanupStorage();
});
beforeEach(async () => {
  await createTestDb();
  resetSafety();
  setProviderOverrides(null);
});

describe("ownership helpers", () => {
  it("getOwnedMedia hides other users', deleted and removed media", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const m = await createTestMedia(a.id);
    expect((await getOwnedMedia(a.id, m.id)).id).toBe(m.id);
    await expect(getOwnedMedia(b.id, m.id)).rejects.toMatchObject({ code: "not_found" });
    const removed = await createTestMedia(a.id, { removedAt: new Date() });
    await expect(getOwnedMedia(a.id, removed.id)).rejects.toMatchObject({ code: "not_found" });
    const deleted = await createTestMedia(a.id, { deletedAt: new Date() });
    await expect(getOwnedMedia(a.id, deleted.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("getOwnedUpload checks owner and purpose", async () => {
    const a = await createTestUser();
    const up = await createTestUpload(a.id, { purpose: "garment" });
    expect((await getOwnedUpload(a.id, up.id, "garment")).id).toBe(up.id);
    await expect(getOwnedUpload(a.id, up.id, "reference")).rejects.toMatchObject({ code: "not_found" });
    await expect(getOwnedUpload((await createTestUser()).id, up.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("toMediaDTO", () => {
  it("signs url, thumbnail and a branded download URL", async () => {
    const a = await createTestUser();
    const m = await createTestMedia(a.id);
    const dto = await toMediaDTO(m);
    expect(dto.url).toMatch(/^http:\/\/localhost:3000\//);
    expect(dto.thumbUrl).not.toBe(dto.url);
    expect(dto.downloadUrl).toContain(encodeURIComponent(`${m.id}.jpg`).replace(/%2E/g, "."));
    expect(dto.createdAt).toBe(m.createdAt.toISOString());
  });
});

describe("providerInputUrl", () => {
  it("uploads bytes to the provider when storage is private", async () => {
    const key = "users/u1/uploads/x.png";
    await getStorage().put(key, await pngBytes(), { contentType: "image/png" });
    const url = await providerInputUrl(key);
    expect(url.startsWith("mock://")).toBe(true);
    const fetched = await createMockAIProvider().fetchOutput(url);
    expect(fetched.contentType).toBe("image/png");
  });

  it("returns a 2h signed URL when storage is publicly reachable", async () => {
    const getSignedUrl = vi.fn(async () => "https://cdn.example.com/signed");
    const previous = getStorage();
    setStorageForTesting({ ...previous, publiclyReachable: true, getSignedUrl } as StorageProvider);
    try {
      expect(await providerInputUrl("users/u1/uploads/x.png")).toBe("https://cdn.example.com/signed");
      expect(getSignedUrl).toHaveBeenCalledWith("users/u1/uploads/x.png", { expiresInSec: 7200 });
    } finally {
      setStorageForTesting(previous);
    }
  });
});

describe("ingestVideos", () => {
  it("stores the mp4 + first-frame thumbnail and a video media row", async () => {
    const a = await createTestUser();
    const model = await createTestModel(a.id);
    const provider = createMockAIProvider();
    const ref = await provider.submitImageToVideo({ imageUrl: "", prompt: "slow push-in", durationSec: 5 });
    const status = await provider.getStatus(ref);
    if (status.state !== "succeeded") throw new Error(`unexpected mock state ${status.state}`);
    const job = await createTestJob(a.id, {
      input: { type: "video", sourceMediaId: "med_x", durationSec: 5 },
      modelId: model.id,
      status: "running",
      creditsCharged: 10,
    });
    const result = await ingestVideos(job, status.output.videos!, { prompt: "slow push-in" });
    expect(result).toMatchObject({ blockedCount: 0 });
    expect(result.mediaIds).toHaveLength(1);
    const [row] = await db.select().from(media).where(eq(media.id, result.mediaIds[0]!));
    expect(row).toMatchObject({ kind: "video", mimeType: "video/mp4", userId: a.id, jobId: job.id });
    expect(row!.durationSec).toBeGreaterThan(0);
    expect(row!.thumbKey).toBeTruthy();
    expect(await getStorage().exists(row!.storageKey)).toBe(true);
    expect(await getStorage().exists(row!.thumbKey!)).toBe(true);
    expect(safetyMock.checkOutputVideo).toHaveBeenCalledTimes(1);
    // Free tier, never paid: watermarked, and always AI-labeled.
    expect(row!.watermarked).toBe(true);
    const stored = await getStorage().get(row!.storageKey);
    expect((await readVideoAiLabel(stored))?.jobId).toBe(job.id);
    expect(row!.bytes).toBe(stored.byteLength);
  });

  it("labels but doesn't watermark videos of paying users", async () => {
    const a = await createTestUser({ plan: "pro", hasPaid: true });
    const provider = createMockAIProvider();
    const ref = await provider.submitImageToVideo({ imageUrl: "", prompt: "wave", durationSec: 5 });
    const status = await provider.getStatus(ref);
    if (status.state !== "succeeded") throw new Error("unexpected mock state");
    const job = await createTestJob(a.id, { input: { type: "video", sourceMediaId: "med_x", durationSec: 5 }, status: "running" });
    const result = await ingestVideos(job, status.output.videos!);
    const [row] = await db.select().from(media).where(eq(media.id, result.mediaIds[0]!));
    expect(row!.watermarked).toBe(false);
    const label = await readVideoAiLabel(await getStorage().get(row!.storageKey));
    expect(label?.comment).toContain(job.id);
  });

  it("discards blocked videos without storing them", async () => {
    const a = await createTestUser();
    const job = await createTestJob(a.id, { input: { type: "video", sourceMediaId: "med_x", durationSec: 5 }, status: "running" });
    safetyMock.checkOutputVideo.mockResolvedValueOnce({ checkedAt: new Date().toISOString(), provider: "mock", allowed: false, categories: ["sexual"] });
    const provider = createMockAIProvider();
    const ref = await provider.submitImageToVideo({ imageUrl: "", prompt: "x", durationSec: 5 });
    const status = await provider.getStatus(ref);
    if (status.state !== "succeeded") throw new Error("unexpected mock state");
    const result = await ingestVideos(job, status.output.videos!);
    expect(result).toEqual({ mediaIds: [], blockedCount: 1 });
    expect(await db.select().from(media)).toHaveLength(0);
  });
});
