/**
 * SAF-7 regression: deleting a fal-trained model must really delete the weights (our copy) and must
 * report honestly that fal's copy wasn't deleted.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailSafe = vi.fn(async () => ({ id: "eml_x", status: "mocked" }));
vi.mock("@/server/email", () => ({ sendEmail: vi.fn(), sendEmailSafe }));

import { createTestDb, createTestUser } from "../../helpers/db";
import { createTestJob, createTestModel } from "../../helpers/factories";
import { db } from "@/db";
import { identityModels, jobs } from "@/db/schema";
import { ProviderDeletionUnsupportedError } from "@/providers/ai/shared/errors";
import { createMockAIProvider } from "@/providers/mock/ai";
import { setProviderOverrides } from "@/providers/registry";
import { createLocalStorage } from "@/providers/storage/local";
import type { StorageProvider } from "@/providers/types";
import { deleteModelCompletely, identityRefFor } from "@/server/models/service";
import { copyWeightsToStorage, setWeightsSql, shouldCopyWeights, storedWeightsOf } from "@/server/models/weights";
import { getStorage, setStorageForTesting, storageKeys } from "@/server/storage";

const LORA_URL = "https://v3.fal.media/files/lora/abc/pytorch_lora_weights.safetensors";
const LORA_BYTES = new Uint8Array(4096).fill(7);

let storage: StorageProvider;
beforeEach(async () => {
  await createTestDb();
  sendEmailSafe.mockClear();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "weights-"));
  storage = createLocalStorage({ dir, baseUrl: "http://localhost:3000", secret: "weights" });
  setStorageForTesting(storage);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(LORA_BYTES, { status: 200, headers: { "content-type": "application/octet-stream" } })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  setProviderOverrides(null);
});

/** A fal-named provider: uploads are recorded, deletion is unsupported (like the real fal adapter). */
function fakeFal() {
  const base = createMockAIProvider();
  const uploads: string[] = [];
  const provider = Object.assign(Object.create(base) as typeof base, {
    name: "fal" as const,
    uploadInput: vi.fn(async () => {
      uploads.push("x");
      return `https://v3.fal.media/files/tmp/${uploads.length}`;
    }),
    deleteModel: vi.fn(async () => {
      throw new ProviderDeletionUnsupportedError("fal can't delete stored files; its copy expires automatically within 24 hours");
    }),
  });
  return provider;
}

async function falModel(userId: string) {
  const model = await createTestModel(userId, { provider: "fal", providerModelRef: LORA_URL });
  const job = await createTestJob(userId, { modelId: model.id, type: "train", status: "succeeded", output: { modelRef: LORA_URL } } as never);
  const weights = await copyWeightsToStorage({ userId, modelId: model.id, jobId: job.id, modelRef: LORA_URL });
  await db.update(identityModels).set({ metadata: setWeightsSql(weights) }).where(eq(identityModels.id, model.id));
  const [row] = await db.select().from(identityModels).where(eq(identityModels.id, model.id));
  return { model: row!, job, weights };
}

describe("fal weights", () => {
  it("copies only https refs of providers that can't delete", () => {
    expect(shouldCopyWeights("fal", LORA_URL)).toBe(true);
    expect(shouldCopyWeights("mock", "mock-lora://x#alice")).toBe(false);
    expect(shouldCopyWeights("replicate", LORA_URL)).toBe(false);
  });

  it("stores the weights under the model prefix and generates from our copy (cached provider upload)", async () => {
    const fal = fakeFal();
    setProviderOverrides({ image: fal, training: fal, video: fal, storage });
    const user = await createTestUser();
    const { model, weights } = await falModel(user.id);
    expect(weights.key.startsWith(storageKeys.modelPrefix(user.id, model.id))).toBe(true);
    expect(new Uint8Array(await getStorage().get(weights.key))).toEqual(LORA_BYTES);
    expect(storedWeightsOf(model)).toMatchObject({ key: weights.key, bytes: LORA_BYTES.byteLength });

    const ref = await identityRefFor(model);
    expect(ref.modelRef).not.toBe(LORA_URL);
    expect(ref.modelRef).toMatch(/^https:\/\/v3\.fal\.media\/files\/tmp\//);
    // The upload URL is cached in metadata until it nears expiry.
    const [reloaded] = await db.select().from(identityModels).where(eq(identityModels.id, model.id));
    expect((await identityRefFor(reloaded!)).modelRef).toBe(ref.modelRef);
    expect(fal.uploadInput).toHaveBeenCalledTimes(1);
  });

  it("deletion removes our copy, scrubs job outputs and reports providerDeleted: false honestly", async () => {
    const fal = fakeFal();
    setProviderOverrides({ image: fal, training: fal, video: fal, storage });
    const user = await createTestUser();
    const { model, job, weights } = await falModel(user.id);
    const result = await deleteModelCompletely(user.id, model.id);
    expect(result.providerDeleted).toBe(false);
    expect(result.providerError).toMatch(/can't delete/);
    expect(await getStorage().exists(weights.key)).toBe(false);
    const [jobRow] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(jobRow!.output).not.toHaveProperty("modelRef");
    expect(sendEmailSafe).toHaveBeenCalledWith(
      "model_deleted",
      expect.any(String),
      expect.objectContaining({ providerCopy: "not_deleted", providerNote: expect.stringMatching(/expires automatically/) }),
      expect.anything(),
    );
  });
});
