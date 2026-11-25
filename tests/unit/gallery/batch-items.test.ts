import { describe, expect, it } from "vitest";
import {
  batchItemState,
  batchItemTitle,
  darkroomStatus,
  retryCost,
  retryRequest,
} from "@/app/app/batches/[id]/batch-items-logic";
import type { JobDTO, MediaDTO } from "@/types/domain";

const job = (over: Partial<JobDTO> = {}): JobDTO => ({
  id: "job_1",
  type: "generate",
  status: "succeeded",
  progress: 100,
  error: null,
  errorCode: null,
  creditsCharged: 2,
  creditsRefunded: 0,
  modelId: "mdl_1",
  packId: "dating",
  batchId: "bat_1",
  input: {
    type: "generate",
    modelId: "mdl_1",
    packId: "dating",
    packPromptIndex: 2,
    quality: "standard",
    numImages: 1,
    aspectRatio: "4:5",
    seed: 7,
  },
  media: [{ id: "med_1" } as MediaDTO],
  blockedCount: 0,
  createdAt: "2026-11-01T00:00:00.000Z",
  completedAt: null,
  ...over,
});

describe("batch page: each photo", () => {
  it("labels every state, with refunds", () => {
    expect(batchItemState(job({ status: "queued", media: [] })).label).toBe("Waiting to start");
    expect(batchItemState(job({ status: "running", progress: 40, media: [] })).label).toBe("Making it… 40%");
    expect(batchItemState(job())).toMatchObject({ kind: "done", label: "Done", canRetry: false });
    expect(batchItemState(job({ media: [], creditsRefunded: 2, blockedCount: 1 }))).toMatchObject({
      kind: "partial",
      label: "No photo kept · 2 credits refunded",
    });
    expect(batchItemState(job({ status: "failed", media: [], creditsRefunded: 2 }))).toMatchObject({
      kind: "failed",
      label: "Failed · 2 credits refunded",
      refunded: 2,
      canRetry: true,
    });
    expect(batchItemState(job({ status: "blocked", media: [], creditsRefunded: 1 }))).toMatchObject({
      kind: "blocked",
      label: "Blocked by the safety check · 1 credit refunded",
      canRetry: false,
    });
    expect(batchItemState(job({ status: "canceled", media: [] })).canRetry).toBe(false);
  });

  it("speaks darkroom on the contact sheet: developing, printed, failed · refunded", () => {
    const status = (over: Partial<JobDTO>) => darkroomStatus(batchItemState(job(over)));
    expect(status({ status: "queued", media: [] })).toBe("Queued");
    expect(status({ status: "running", progress: 40, media: [] })).toBe("Developing");
    expect(status({})).toBe("Printed");
    expect(status({ creditsRefunded: 2 })).toBe("Printed · Refunded");
    expect(status({ status: "failed", media: [], creditsRefunded: 2 })).toBe("Failed · Refunded");
    expect(status({ status: "failed", media: [] })).toBe("Failed");
    expect(status({ status: "blocked", media: [], creditsRefunded: 1 })).toBe("Blocked · Refunded");
    expect(status({ status: "canceled", media: [] })).toBe("Canceled");
  });

  it("retries a failed photo with the same pack prompt and a new seed, at its original price", () => {
    const failed = job({ status: "failed", media: [] });
    expect(retryRequest(failed)).toEqual({
      type: "generate",
      modelId: "mdl_1",
      packId: "dating",
      packPromptIndex: 2,
      quality: "standard",
      numImages: 1,
      aspectRatio: "4:5",
    });
    expect(failed.input).toHaveProperty("seed", 7); // the original is untouched
    expect(retryRequest(job({ input: { type: "upscale", sourceMediaId: "m", scale: 2, faceRestore: true } }))).toBeNull();
    expect(retryCost([failed, job({ creditsCharged: 4 })])).toBe(6);
  });

  it("names photos by their pack prompt", () => {
    expect(batchItemTitle(job(), 0, ["A", "B", "Rooftop at dusk"])).toBe("Rooftop at dusk");
    expect(batchItemTitle(job(), 4, [])).toBe("Photo 5");
  });
});
