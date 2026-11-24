import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MOTION_PROMPT, MAX_TALKING_WORDS } from "@/components/video/video-options";
import { db } from "@/db";
import { jobs, media } from "@/db/schema";
import type { MediaRow, UserRow } from "@/db/types";
import { AudioTooLongError } from "@/providers/ai/shared/errors";
import type { ImageToVideoInput, TalkingVideoInput } from "@/providers/types";
import { setProviderOverrides } from "@/providers/registry";
import { getBalance } from "@/server/credits/ledger";
import { createJob, syncJob, toJobDTO } from "@/server/jobs/engine";
import { getStorage } from "@/server/storage";
import type { JobInput } from "@/types/domain";
import { createTestDb, createTestJob, createTestMedia, createTestModel, createTestUser } from "../../helpers/factories";
import { BLOCKED_WORD, overrideMockAI, pngBytes, resetSafety, safetyMock, useTempStorage } from "../jobs/fixtures";

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

let u: UserRow;
let modelId: string;
let photo: MediaRow;

/** A stored, owned photo (bytes in storage so providerInputUrl can read it). */
async function storedPhoto(userId: string, overrides: Parameters<typeof createTestMedia>[1] = {}): Promise<MediaRow> {
  const row = await createTestMedia(userId, { mimeType: "image/png", width: 64, height: 80, ...overrides });
  await getStorage().put(row.storageKey, await pngBytes(64, 80), { contentType: "image/png" });
  return row;
}

beforeEach(async () => {
  await createTestDb();
  resetSafety();
  setProviderOverrides(null);
  u = await createTestUser({ credits: 200, plan: "pro", hasPaid: true });
  modelId = (await createTestModel(u.id)).id;
  photo = await storedPhoto(u.id, { modelId });
});
afterEach(() => {
  setProviderOverrides(null);
  vi.restoreAllMocks();
});

const video = (over: Partial<Extract<JobInput, { type: "video" }>> = {}): JobInput =>
  ({ type: "video", sourceMediaId: photo.id, durationSec: 5, ...over }) as JobInput;
const talking = (over: Partial<Extract<JobInput, { type: "talking_video" }>> = {}): JobInput =>
  ({ type: "talking_video", sourceMediaId: photo.id, script: "Hi, I'm Sam. Welcome to my channel!", voice: "neutral", ...over }) as JobInput;

function spyVideoProvider() {
  const i2v = vi.fn<(input: ImageToVideoInput) => void>();
  const talk = vi.fn<(input: TalkingVideoInput) => void>();
  const provider = overrideMockAI();
  const { submitImageToVideo, submitTalkingVideo } = provider;
  provider.submitImageToVideo = async (input, opts) => {
    i2v(input);
    return submitImageToVideo(input, opts);
  };
  provider.submitTalkingVideo = async (input, opts) => {
    talk(input);
    return submitTalkingVideo(input, opts);
  };
  return { i2v, talk };
}

async function expectNoCharge() {
  const videoJobs = await db.select().from(jobs).where(inArray(jobs.type, ["video", "talking_video"]));
  expect(videoJobs).toHaveLength(0);
  expect(await getBalance(u.id)).toBe(200);
}

describe("video handler: plan guards", () => {
  it("rejects a photo owned by someone else without charging", async () => {
    const other = await createTestUser();
    const theirs = await storedPhoto(other.id);
    await expect(createJob(u, video({ sourceMediaId: theirs.id }))).rejects.toMatchObject({ code: "not_found" });
    await expectNoCharge();
  });

  it("rejects deleted photos", async () => {
    await db.update(media).set({ deletedAt: new Date() }).where(eq(media.id, photo.id));
    await expect(createJob(u, video())).rejects.toMatchObject({ code: "not_found" });
    await expectNoCharge();
  });

  it("rejects a video as the source", async () => {
    const clip = await createTestMedia(u.id, { kind: "video", mimeType: "video/mp4", durationSec: 5 });
    await expect(createJob(u, video({ sourceMediaId: clip.id }))).rejects.toMatchObject({ code: "validation_error" });
    await expectNoCharge();
  });

  it("moderates the motion prompt", async () => {
    await expect(createJob(u, video({ prompt: `she ${BLOCKED_WORD}` }))).rejects.toMatchObject({ code: "content_blocked" });
    await expectNoCharge();
  });

  it("doesn't moderate (or require) a blank prompt and uses the default motion", async () => {
    const { i2v } = spyVideoProvider();
    const job = await createJob(u, video());
    expect(job.status).toBe("running");
    expect(safetyMock.assertTextAllowed).not.toHaveBeenCalled();
    expect(i2v).toHaveBeenCalledTimes(1);
    expect(i2v.mock.calls[0]![0]).toMatchObject({ prompt: DEFAULT_MOTION_PROMPT, durationSec: 5 });
    expect(i2v.mock.calls[0]![0].imageUrl).toBeTruthy();
  });
});

describe("video handler: lifecycle", () => {
  it("charges by duration, submits and stores an MP4 with thumbnail + parent", async () => {
    const { i2v } = spyVideoProvider();
    const job = await createJob(u, video({ prompt: "slow smile", durationSec: 10, aspectRatio: "9:16" }));
    expect(job.creditsCharged).toBe(18);
    expect(job.sourceMediaId).toBe(photo.id);
    expect(job.modelId).toBe(modelId);
    expect(await getBalance(u.id)).toBe(182);
    expect(safetyMock.assertTextAllowed).toHaveBeenCalledWith(["slow smile"], expect.objectContaining({ userId: u.id }));
    expect(i2v.mock.calls[0]![0]).toMatchObject({ prompt: "slow smile", durationSec: 10, aspectRatio: "9:16" });

    const done = await syncJob(job.id);
    expect(done.status).toBe("succeeded");
    expect(done.output?.mediaIds).toHaveLength(1);
    expect(done.output?.finalPrompt).toBe("slow smile");

    const [row] = await db.select().from(media).where(eq(media.jobId, job.id));
    expect(row).toMatchObject({
      kind: "video",
      mimeType: "video/mp4",
      userId: u.id,
      parentMediaId: photo.id,
      modelId,
      prompt: "slow smile",
    });
    expect(row!.durationSec).toBeGreaterThan(0);
    expect(row!.thumbKey).toBeTruthy();
    expect(await getStorage().exists(row!.storageKey)).toBe(true);
    expect(await getStorage().exists(row!.thumbKey!)).toBe(true);
    expect(safetyMock.checkOutputVideo).toHaveBeenCalledTimes(1);

    const dto = await toJobDTO(done);
    expect(dto.media).toHaveLength(1);
    expect(dto.media[0]).toMatchObject({ kind: "video", parentMediaId: photo.id });
    expect(dto.media[0]!.thumbUrl).not.toBe(dto.media[0]!.url);
    expect(await getBalance(u.id)).toBe(182);
  });

  it("charges 10 credits for a 5 s clip", async () => {
    const job = await createJob(u, video());
    expect(job.creditsCharged).toBe(10);
  });

  it("blocks unsafe output videos and refunds in full", async () => {
    safetyMock.checkOutputVideo.mockResolvedValueOnce({
      checkedAt: new Date().toISOString(),
      provider: "mock",
      allowed: false,
      categories: ["sexual"],
    });
    const job = await createJob(u, video());
    const done = await syncJob(job.id);
    expect(done.status).toBe("blocked");
    expect(await db.select().from(media).where(eq(media.jobId, job.id))).toHaveLength(0);
    expect(await getBalance(u.id)).toBe(200);
  });

  it("refunds when the provider fails", async () => {
    const job = await createJob(u, video({ prompt: "gentle wave [mock:fail]" }));
    const done = await syncJob(job.id);
    expect(done.status).toBe("failed");
    expect(done.creditsRefunded).toBe(10);
    expect(await getBalance(u.id)).toBe(200);
  });
});

describe("talking video handler", () => {
  it("prices per started 5 s of speech, submits script + voice and stores the video", async () => {
    const { talk } = spyVideoProvider();
    // 30 words -> 12 s -> 3 blocks of 8 credits.
    const script = Array.from({ length: 30 }, (_, i) => `word${String.fromCharCode(97 + (i % 26))}`).join(" ");
    const job = await createJob(u, talking({ script: `  ${script}  `, voice: "deep_male" }));
    expect(job.creditsCharged).toBe(36);
    expect(safetyMock.assertTextAllowed).toHaveBeenCalledWith([script], expect.objectContaining({ userId: u.id }));
    // Paid 15 s; the provider may animate up to 1.5x that before refusing (PAY-2).
    expect(talk.mock.calls[0]![0]).toMatchObject({ script, voice: "deep_male", maxAudioSeconds: 23 });

    const done = await syncJob(job.id);
    expect(done.status).toBe("succeeded");
    const [row] = await db.select().from(media).where(eq(media.jobId, job.id));
    expect(row).toMatchObject({ kind: "video", mimeType: "video/mp4", parentMediaId: photo.id, prompt: script });
    expect(row!.durationSec).toBeGreaterThan(0);
    expect(row!.thumbKey).toBeTruthy();
    expect(await getBalance(u.id)).toBe(164);
  });

  it("rejects scripts whose characters exceed ~60 s of speech, even without spaces (PAY-2)", async () => {
    await expect(createJob(u, talking({ script: "こんにちは".repeat(120) }))).rejects.toMatchObject({
      code: "validation_error",
      details: { estimatedSeconds: 120, maxSeconds: 60 },
    });
    await expect(createJob(u, talking({ script: "1234567890".repeat(60) }))).rejects.toMatchObject({ code: "validation_error" });
    await expectNoCharge();
  });

  it("refunds and explains when the provider's speech audio runs longer than paid for (PAY-2)", async () => {
    const provider = overrideMockAI();
    provider.submitTalkingVideo = async (input) => {
      throw new AudioTooLongError({ provider: "fal", audioSeconds: 41.2, maxSeconds: input.maxAudioSeconds ?? 0 });
    };
    await expect(createJob(u, talking({ script: "Hello there, this is a short script." }))).rejects.toMatchObject({
      code: "validation_error",
      details: { audioSeconds: 41.2, maxSeconds: 8 },
    });
    const [job] = await db.select().from(jobs).where(eq(jobs.type, "talking_video"));
    expect(job).toMatchObject({ status: "failed", creditsRefunded: job!.creditsCharged });
    expect(await getBalance(u.id)).toBe(200);
  });

  it("rejects scripts longer than ~60 s of speech", async () => {
    const script = Array.from({ length: MAX_TALKING_WORDS + 1 }, () => "hi").join(" ");
    expect(script.length).toBeLessThanOrEqual(600);
    await expect(createJob(u, talking({ script }))).rejects.toMatchObject({
      code: "validation_error",
      details: { estimatedSeconds: 61, maxSeconds: 60 },
    });
    await expectNoCharge();
  });

  it("accepts a script right at the limit", async () => {
    const script = Array.from({ length: MAX_TALKING_WORDS }, () => "hi").join(" ");
    const job = await createJob(u, talking({ script }));
    expect(job.creditsCharged).toBe(144);
  });

  it("blocks unsafe scripts before charging", async () => {
    await expect(createJob(u, talking({ script: `Say ${BLOCKED_WORD} now` }))).rejects.toMatchObject({
      code: "content_blocked",
    });
    await expectNoCharge();
  });

  it("enforces ownership and still-image sources", async () => {
    const other = await createTestUser();
    const theirs = await storedPhoto(other.id);
    await expect(createJob(u, talking({ sourceMediaId: theirs.id }))).rejects.toMatchObject({ code: "not_found" });
    const clip = await createTestMedia(u.id, { kind: "video", mimeType: "video/mp4" });
    await expect(createJob(u, talking({ sourceMediaId: clip.id }))).rejects.toMatchObject({ code: "validation_error" });
    await expectNoCharge();
  });

  it("refuses Together photos and edits made from them", async () => {
    const together = await createTestJob(u.id, {
      input: { type: "multi_person", modelIds: ["mdl_a", "mdl_b"], prompt: "two friends", numImages: 1, aspectRatio: "4:5" },
      status: "succeeded",
    });
    const pair = await storedPhoto(u.id, { jobId: together.id });
    await expect(createJob(u, talking({ sourceMediaId: pair.id }))).rejects.toMatchObject({ code: "validation_error" });

    const edited = await storedPhoto(u.id, { parentMediaId: pair.id });
    await expect(createJob(u, talking({ sourceMediaId: edited.id }))).rejects.toMatchObject({ code: "validation_error" });
    await expectNoCharge();

    // Photo-to-video of a Together photo is refused too: the partner consented to photos, not to being animated (SAF-12).
    await expect(createJob(u, video({ sourceMediaId: pair.id }))).rejects.toMatchObject({ code: "validation_error" });
    await expect(createJob(u, video({ sourceMediaId: edited.id }))).rejects.toMatchObject({ code: "validation_error" });
    await expectNoCharge();
  });
});
