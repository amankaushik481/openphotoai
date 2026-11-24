import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODELS } from "@/config/models";
import { createReplicateProvider } from "@/providers/ai/replicate";
import { combineStatuses, collectUrls, normalizeJob, outputKindFor, parseProgress } from "@/providers/ai/replicate/status";
import type { ProviderJobRef } from "@/providers/types";
import { apiError, fake, resetFake } from "./fake-replicate";

vi.mock("replicate", async () => (await import("./fake-replicate")).replicateModule);

const R = MODELS.replicate;
const HASH = "b".repeat(64);
const provider = () => createReplicateProvider({ apiToken: "r8_test", owner: "acme" });
const ref = (requestId: string, endpoint: string = R.generate.id): ProviderJobRef => ({ provider: "replicate", endpoint, requestId });

beforeEach(() => {
  resetFake();
});

describe("prediction status mapping", () => {
  it("maps starting -> queued and processing -> running with tqdm progress", async () => {
    fake.predictions.get.mockResolvedValueOnce({ id: "p1", status: "starting" });
    expect(await provider().getStatus(ref("p1"))).toEqual({ state: "queued" });

    fake.predictions.get.mockResolvedValueOnce({
      id: "p1",
      status: "processing",
      logs: "Loading LoRA\n 40%|████      | 11/28 [00:02<00:03, 5.1it/s]\n 76%|███████▌  | 21/28 [00:04<00:01, 5.2it/s]",
    });
    const running = await provider().getStatus(ref("p1"));
    expect(running).toMatchObject({ state: "running", progress: 76 });
    expect(running.state === "running" && running.logs?.[0]).toBe("Loading LoRA");
    expect(fake.predictions.get).toHaveBeenCalledWith("p1");
  });

  it("normalizes a string[] image output, typing each URL and carrying the seed", async () => {
    fake.predictions.get.mockResolvedValue({
      id: "p1",
      status: "succeeded",
      input: { seed: 42 },
      output: ["https://replicate.delivery/a/out-0.jpg", "https://replicate.delivery/a/out-1.png"],
    });
    const status = await provider().getStatus(ref("p1"));
    expect(status).toMatchObject({
      state: "succeeded",
      output: {
        seed: 42,
        images: [
          { url: "https://replicate.delivery/a/out-0.jpg", contentType: "image/jpeg" },
          { url: "https://replicate.delivery/a/out-1.png", contentType: "image/png" },
        ],
      },
    });
  });

  it("normalizes a single string output", async () => {
    fake.predictions.get.mockResolvedValue({ id: "p1", status: "succeeded", output: "https://replicate.delivery/a/out.webp" });
    const status = await provider().getStatus(ref("p1", "google/nano-banana-2"));
    expect(status).toMatchObject({ state: "succeeded", output: { images: [{ url: "https://replicate.delivery/a/out.webp", contentType: "image/webp" }] } });
  });

  it("normalizes video and audio endpoints", async () => {
    fake.predictions.get.mockResolvedValueOnce({ id: "v1", status: "succeeded", output: "https://replicate.delivery/v/out.mp4" });
    expect(await provider().getStatus(ref("v1", R.imageToVideo.id))).toMatchObject({
      state: "succeeded",
      output: { videos: [{ url: "https://replicate.delivery/v/out.mp4", contentType: "video/mp4" }] },
    });
    fake.predictions.get.mockResolvedValueOnce({ id: "t1", status: "succeeded", output: { audio: "https://replicate.delivery/t/a.mp3" } });
    expect(await provider().getStatus(ref("t1", R.tts.id))).toMatchObject({
      state: "succeeded",
      output: { audio: [{ url: "https://replicate.delivery/t/a.mp3" }] },
    });
  });

  it("maps failures (with retryability), cancellations and empty outputs", async () => {
    fake.predictions.get.mockResolvedValueOnce({ id: "p1", status: "failed", error: "NSFW content detected. Try a different prompt." });
    expect(await provider().getStatus(ref("p1"))).toEqual({ state: "failed", error: "NSFW content detected. Try a different prompt.", retryable: false });

    fake.predictions.get.mockResolvedValueOnce({ id: "p1", status: "failed", error: "CUDA out of memory" });
    expect(await provider().getStatus(ref("p1"))).toMatchObject({ state: "failed", retryable: true });

    fake.predictions.get.mockResolvedValueOnce({ id: "p1", status: "canceled" });
    expect(await provider().getStatus(ref("p1"))).toEqual({ state: "canceled" });

    fake.predictions.get.mockResolvedValueOnce({ id: "p1", status: "succeeded", output: null });
    expect(await provider().getStatus(ref("p1"))).toMatchObject({ state: "failed" });

    fake.predictions.get.mockRejectedValueOnce(apiError(404));
    expect(await provider().getStatus(ref("p1"))).toMatchObject({ state: "failed", retryable: false });
  });

  it("combines a prediction group", async () => {
    fake.predictions.get.mockImplementation(async (id: string) =>
      id === "p1"
        ? { id, status: "succeeded", output: ["https://replicate.delivery/1.jpg"] }
        : { id, status: "processing", logs: " 50%|█████     | 14/28 [00:01<00:01]" },
    );
    expect(await provider().getStatus(ref("grp:p1,p2"))).toEqual({ state: "running", progress: 75 });

    fake.predictions.get.mockImplementation(async (id: string) => ({
      id,
      status: "succeeded",
      output: [`https://replicate.delivery/${id}.jpg`],
    }));
    const done = await provider().getStatus(ref("grp:p1,p2"));
    expect(done.state === "succeeded" && done.output.images?.map((i) => i.url)).toEqual([
      "https://replicate.delivery/p1.jpg",
      "https://replicate.delivery/p2.jpg",
    ]);
  });
});

describe("training status", () => {
  it("uses trainings.get for trn: ids and returns version + weights as the modelRef", async () => {
    fake.trainings.get.mockResolvedValue({
      id: "t1",
      status: "succeeded",
      output: { version: `acme/openshoot-ohwxabcdef:${HASH}`, weights: "https://replicate.delivery/w/trained_model.tar" },
      urls: { get: "https://api.replicate.com/v1/trainings/t1" },
    });
    const status = await provider().getStatus(ref("trn:t1", R.train.id));
    expect(fake.trainings.get).toHaveBeenCalledWith("t1");
    expect(fake.predictions.get).not.toHaveBeenCalled();
    expect(status).toMatchObject({
      state: "succeeded",
      output: { modelRef: `acme/openshoot-ohwxabcdef:${HASH}|https://replicate.delivery/w/trained_model.tar` },
    });
  });

  it("reports running trainings and failed trainings without output", async () => {
    fake.trainings.get.mockResolvedValueOnce({ id: "t1", status: "processing", logs: "flux_train_replicate:  30%|███       | 300/1000 [00:30<01:10]" });
    expect(await provider().getStatus(ref("trn:t1", R.train.id))).toMatchObject({ state: "running", progress: 30 });

    fake.trainings.get.mockResolvedValueOnce({ id: "t1", status: "succeeded", output: {} });
    expect(await provider().getStatus(ref("trn:t1", R.train.id))).toMatchObject({ state: "failed" });
  });
});

describe("cancel", () => {
  it("routes by request id kind", async () => {
    const p = provider();
    await p.cancel(ref("p1"));
    await p.cancel(ref("grp:p2,p3"));
    await p.cancel(ref("trn:t1", R.train.id));
    expect(fake.predictions.cancel.mock.calls.map((c) => c[0])).toEqual(["p1", "p2", "p3"]);
    expect(fake.trainings.cancel).toHaveBeenCalledWith("t1");
  });
});

describe("pure helpers", () => {
  it("collects URLs from strings, arrays and objects", () => {
    expect(collectUrls("https://x/1.png")).toEqual(["https://x/1.png"]);
    expect(collectUrls(["https://x/1.png", "https://x/2.png"])).toEqual(["https://x/1.png", "https://x/2.png"]);
    expect(collectUrls({ image: "https://x/1.png", meta: { mask: "https://x/m.png", n: 3, label: "normal" } })).toEqual([
      "https://x/1.png",
      "https://x/m.png",
    ]);
    expect(collectUrls(null)).toEqual([]);
  });

  it("knows each endpoint's output kind", () => {
    expect(outputKindFor(R.train.id)).toBe("training");
    expect(outputKindFor(R.talkingVideo.id)).toBe("video");
    expect(outputKindFor(R.tts.id)).toBe("audio");
    expect(outputKindFor(R.llm.id)).toBe("text");
    expect(outputKindFor("acme/openshoot-ohwxabcdef")).toBe("image");
  });

  it("parses step-style progress and ignores logs without progress", () => {
    expect(parseProgress("step 250/1000 loss=0.1")).toBe(25);
    expect(parseProgress("just a line")).toBeUndefined();
    expect(parseProgress(undefined)).toBeUndefined();
  });

  it("joins text outputs and treats aborted as canceled", () => {
    expect(normalizeJob({ id: "x", status: "succeeded", output: ["Hel", "lo"] }, "text")).toMatchObject({
      state: "succeeded",
      output: { text: "Hello" },
    });
    expect(normalizeJob({ id: "x", status: "aborted" }, "image")).toEqual({ state: "canceled" });
  });

  it("surfaces the first failure of a group", () => {
    expect(combineStatuses([{ state: "queued" }, { state: "failed", error: "x" }])).toEqual({ state: "failed", error: "x" });
    expect(combineStatuses([{ state: "queued" }, { state: "queued" }])).toEqual({ state: "queued" });
  });
});
