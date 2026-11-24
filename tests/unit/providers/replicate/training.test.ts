import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODELS } from "@/config/models";
import { createReplicateProvider } from "@/providers/ai/replicate";
import { ProviderRequestError } from "@/providers/ai/shared/errors";
import { apiError, fake, resetFake } from "./fake-replicate";

vi.mock("replicate", async () => (await import("./fake-replicate")).replicateModule);

const R = MODELS.replicate;
const HASH = "c".repeat(64);
const provider = () => createReplicateProvider({ apiToken: "r8_test", owner: "acme" });
const training = {
  imagesZipUrl: "https://cdn.example.com/selfies.zip",
  imageCount: 20,
  triggerWord: "ohwxabcdef",
  subject: "woman" as const,
};

beforeEach(() => {
  resetFake();
  fake.models.get.mockResolvedValue({ latest_version: { id: "trainer-v1" } });
  fake.models.create.mockResolvedValue({ owner: "acme", name: "openshoot-ohwxabcdef" });
  fake.trainings.create.mockResolvedValue({ id: "t1", status: "starting" });
  fake.request.mockResolvedValue(new Response(null, { status: 204 }));
});

describe("submitTraining", () => {
  it("creates the private destination model, then starts the training into it", async () => {
    const ref = await provider().submitTraining(training, {
      webhookUrl: "https://app.example.com/api/webhooks/ai/replicate",
    });

    expect(fake.models.create).toHaveBeenCalledWith("acme", "openshoot-ohwxabcdef", {
      visibility: "private",
      hardware: "cpu",
    });
    expect(fake.models.get).toHaveBeenCalledWith("replicate", "fast-flux-trainer");
    expect(fake.trainings.create).toHaveBeenCalledWith("replicate", "fast-flux-trainer", "trainer-v1", {
      destination: "acme/openshoot-ohwxabcdef",
      input: { input_images: training.imagesZipUrl, trigger_word: "ohwxabcdef", lora_type: "subject" },
      webhook: "https://app.example.com/api/webhooks/ai/replicate",
      webhook_events_filter: ["completed"],
    });
    expect(fake.models.create.mock.invocationCallOrder[0]).toBeLessThan(
      fake.trainings.create.mock.invocationCallOrder[0],
    );
    expect(ref).toEqual({ provider: "replicate", endpoint: R.train.id, requestId: "trn:t1" });
  });

  it("treats an existing destination model (409) as fine and passes custom steps", async () => {
    fake.models.create.mockRejectedValue(apiError(409, "conflict"));
    await provider().submitTraining({ ...training, steps: 1500 });
    expect(fake.trainings.create).toHaveBeenCalledTimes(1);
    const options = fake.trainings.create.mock.calls[0][3] as { input: Record<string, unknown>; webhook?: string };
    expect(options.input.training_steps).toBe(1500);
    expect(options).not.toHaveProperty("webhook");
  });

  it("sanitizes the trigger word into a valid model name", async () => {
    await provider().submitTraining({ ...training, triggerWord: "OHWX Ab_c!!" });
    expect(fake.models.create.mock.calls[0][1]).toBe("openshoot-ohwx-ab_c");
  });

  it("does not start a training when the destination cannot be created", async () => {
    fake.models.create.mockRejectedValue(apiError(500, "server error"));
    const err = await provider()
      .submitTraining(training)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderRequestError);
    expect(err).toMatchObject({ status: 500, retryable: true });
    expect(fake.trainings.create).not.toHaveBeenCalled();
  });
});

describe("deleteModel", () => {
  const modelRef = `acme/openshoot-ohwxabcdef:${HASH}|https://replicate.delivery/w/trained_model.tar`;

  it("deletes every version (across pages), then the model", async () => {
    fake.models.versions.list.mockResolvedValue({
      results: [{ id: HASH }, { id: "older1" }],
      next: "https://api.replicate.com/v1/models/acme/openshoot-ohwxabcdef/versions?cursor=2",
    });
    fake.request.mockImplementation(async (route: string, init: { method: string }) =>
      init.method === "GET" ? Response.json({ results: [{ id: "older2" }] }) : new Response(null, { status: 204 }),
    );

    await provider().deleteModel(modelRef);

    expect(fake.models.versions.list).toHaveBeenCalledWith("acme", "openshoot-ohwxabcdef");
    const deletes = fake.request.mock.calls
      .filter((c) => (c[1] as { method: string }).method === "DELETE")
      .map((c) => c[0]);
    expect(deletes).toEqual([
      `/models/acme/openshoot-ohwxabcdef/versions/${HASH}`,
      "/models/acme/openshoot-ohwxabcdef/versions/older1",
      "/models/acme/openshoot-ohwxabcdef/versions/older2",
      "/models/acme/openshoot-ohwxabcdef",
    ]);
  });

  it("tolerates versions or the model already being gone", async () => {
    fake.models.versions.list.mockResolvedValue({ results: [] });
    fake.request.mockRejectedValue(apiError(404, "not found"));
    await expect(provider().deleteModel(modelRef)).resolves.toBeUndefined();
    expect(fake.request).toHaveBeenCalledTimes(2); // the ref's version + the model

    fake.request.mockClear();
    fake.models.versions.list.mockRejectedValue(apiError(404, "not found"));
    await expect(provider().deleteModel(modelRef)).resolves.toBeUndefined();
    expect(fake.request).not.toHaveBeenCalled();
  });

  it("surfaces other deletion errors so the deletion can be retried", async () => {
    fake.models.versions.list.mockResolvedValue({ results: [] });
    fake.request.mockRejectedValue(apiError(409, "model has versions"));
    await expect(provider().deleteModel(modelRef)).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("never touches models outside this owner's openshoot-* namespace", async () => {
    await provider().deleteModel(`someone/openshoot-x:${HASH}`);
    await provider().deleteModel(`acme/production-model:${HASH}`);
    await provider().deleteModel("https://replicate.delivery/w/trained_model.tar");
    expect(fake.models.versions.list).not.toHaveBeenCalled();
    expect(fake.request).not.toHaveBeenCalled();
  });
});
