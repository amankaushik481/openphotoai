/**
 * Training completion races (GM-F correctness review, COR-2):
 *  - a completion attempt whose lease expired (slow weights download) while another attempt finished
 *    must not delete the weights the finished attempt stored, nor the provider's copy;
 *  - canceling a training while its completion is being finalized must never leave a READY model on
 *    a canceled, fully refunded job (free training), and a canceled one must leave no weights behind.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emailHook = vi.hoisted(() => ({ onModelReady: null as null | (() => Promise<void>) }));
vi.mock("@/server/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "eml_x", status: "mocked" })),
  sendEmailSafe: vi.fn(async (template: string) => {
    if (template === "model_ready" && emailHook.onModelReady) await emailHook.onModelReady();
    return { id: "eml_x", status: "mocked" };
  }),
}));
vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyMock);

import { db } from "@/db";
import { identityModels, jobs } from "@/db/schema";
import type { IdentityModelRow, JobRow, UserRow } from "@/db/types";
import { createMockAIProvider } from "@/providers/mock/ai";
import { setProviderOverrides } from "@/providers/registry";
import { createLocalStorage } from "@/providers/storage/local";
import { getBalance } from "@/server/credits/ledger";
import { cancelJob, syncJob } from "@/server/jobs/engine";
import { storedWeightsOf } from "@/server/models/weights";
import { getStorage, setStorageForTesting } from "@/server/storage";
import { createTestDb, createTestJob, createTestModel, createTestUser } from "../../helpers/factories";

const LORA_URL = "https://v3.fal.media/files/lora/abc/pytorch_lora_weights.safetensors";
const LORA_BYTES = new Uint8Array(4096).fill(7);

/** fetch() of the weights: resolves at once unless a test parks the next call. */
const weightsFetch = { park: false, parked: null as null | (() => void), onFetch: null as null | (() => Promise<void>) };

function fakeFal() {
  const base = createMockAIProvider();
  return Object.assign(Object.create(base) as typeof base, {
    name: "fal" as const,
    getStatus: vi.fn(async () => ({ state: "succeeded" as const, output: { modelRef: LORA_URL } })),
    cancel: vi.fn(async () => undefined),
    deleteModel: vi.fn(async () => undefined),
  });
}

let u: UserRow;
let model: IdentityModelRow;
let job: JobRow;
let fal: ReturnType<typeof fakeFal>;

beforeEach(async () => {
  await createTestDb();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "train-finalize-"));
  setStorageForTesting(createLocalStorage({ dir, baseUrl: "http://localhost:3000", secret: "train-finalize" }));
  emailHook.onModelReady = null;
  weightsFetch.park = false;
  weightsFetch.parked = null;
  weightsFetch.onFetch = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (weightsFetch.onFetch) await weightsFetch.onFetch();
      if (weightsFetch.park) {
        weightsFetch.park = false;
        await new Promise<void>((resolve) => (weightsFetch.parked = resolve));
      }
      return new Response(LORA_BYTES, { status: 200, headers: { "content-type": "application/octet-stream" } });
    }),
  );
  fal = fakeFal();
  setProviderOverrides({ image: fal, training: fal, video: fal });

  u = await createTestUser({ credits: 0, plan: "pro", hasPaid: true });
  model = await createTestModel(u.id, { status: "training", provider: null, providerModelRef: null, trainedAt: null });
  job = await createTestJob(u.id, {
    type: "train",
    input: { type: "train", modelId: model.id },
    modelId: model.id,
    status: "running",
    provider: "fal",
    providerEndpoint: "fal-ai/flux-lora-fast-training",
    providerRequestId: `req_${model.id}`,
    creditsCharged: 40,
    submittedAt: new Date(),
    output: { plan: { triggerWord: model.triggerWord, subject: "person" } },
  } as never);
  await db.update(identityModels).set({ trainingJobId: job.id }).where(eq(identityModels.id, model.id));
  // The 40 credits the job was charged (so refunds have something to give back).
  const { applyCredit } = await import("@/server/credits/ledger");
  await applyCredit({ userId: u.id, delta: 40, reason: "admin_adjust", idempotencyKey: `seed:${u.id}` });
  await applyCredit({ userId: u.id, delta: -40, reason: "job_debit", jobId: job.id, idempotencyKey: `job:${job.id}:debit` });
});

afterEach(() => {
  vi.unstubAllGlobals();
  setProviderOverrides(null);
  setStorageForTesting(null);
});

async function reload() {
  const [m] = await db.select().from(identityModels).where(eq(identityModels.id, model.id));
  const [j] = await db.select().from(jobs).where(eq(jobs.id, job.id));
  return { model: m!, job: j! };
}

async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 500 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
  if (!cond()) throw new Error("timed out waiting");
}

describe("train completion", () => {
  it("an attempt whose lease expired mid-download does not delete the weights of the attempt that finished", async () => {
    weightsFetch.park = true;
    const slow = syncJob(job.id, { force: true }); // attempt 1: parks in the weights download
    await until(() => weightsFetch.parked !== null);

    // Its lease expires (download slower than FINALIZE_LEASE_SEC); the cron's attempt 2 takes over.
    await db
      .update(jobs)
      .set({ output: sql`jsonb_set(${jobs.output}, '{finalizing,at}', to_jsonb(now() - interval '1 hour'))` })
      .where(eq(jobs.id, job.id));
    const second = await syncJob(job.id, { force: true });
    expect(second.status).toBe("succeeded");

    weightsFetch.parked!();
    await slow;

    const { model: m, job: j } = await reload();
    expect(j.status).toBe("succeeded");
    expect(m.status).toBe("ready");
    expect(m.providerModelRef).toBe(LORA_URL);
    const weights = storedWeightsOf(m);
    expect(weights).not.toBeNull();
    expect(await getStorage().exists(weights!.key)).toBe(true);
    expect(fal.deleteModel).not.toHaveBeenCalled();
    expect(await getBalance(u.id)).toBe(0);
  });

  it("a cancel that lands while the model-ready email is sent can't leave a ready model on a refunded job", async () => {
    emailHook.onModelReady = async () => {
      emailHook.onModelReady = null;
      await cancelJob(u.id, job.id);
    };
    await syncJob(job.id, { force: true });

    const { model: m, job: j } = await reload();
    const freeTraining = m.status === "ready" && j.status !== "succeeded";
    expect(freeTraining).toBe(false);
    if (j.status === "succeeded") {
      expect(await getBalance(u.id)).toBe(0);
      expect(m.status).toBe("ready");
    } else {
      expect(m.status).toBe("collecting");
      expect(await getBalance(u.id)).toBe(40);
    }
  });

  it("a cancel that wins during finalization refunds, resets the model and removes every copy of the weights", async () => {
    let storedKey: string | null = null;
    weightsFetch.onFetch = async () => {
      weightsFetch.onFetch = null;
      await cancelJob(u.id, job.id);
    };
    const put = getStorage().put.bind(getStorage());
    vi.spyOn(getStorage(), "put").mockImplementation(async (key, ...rest) => {
      if (key.includes("/weights/")) storedKey = key;
      return put(key, ...rest);
    });
    await syncJob(job.id, { force: true });

    const { model: m, job: j } = await reload();
    expect(j.status).toBe("canceled");
    expect(await getBalance(u.id)).toBe(40);
    expect(m.status).toBe("collecting");
    expect(m.providerModelRef).toBeNull();
    expect(storedWeightsOf(m)).toBeNull();
    expect(storedKey).not.toBeNull();
    expect(await getStorage().exists(storedKey!)).toBe(false);
    expect(fal.deleteModel).toHaveBeenCalledWith(LORA_URL);
  });
});

describe("finalization lease heartbeat", () => {
  afterEach(() => vi.useRealTimers());

  it("a slow but healthy completion keeps its lease, so no second worker re-ingests the same outputs", async () => {
    const { FINALIZE_LEASE_SEC, FINALIZE_RENEW_INTERVAL_MS } = await import("@/server/jobs/engine");
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    weightsFetch.park = true;
    const slow = syncJob(job.id, { force: true });
    await until(() => weightsFetch.parked !== null);

    // Nearly FINALIZE_LEASE_SEC into the download...
    await db
      .update(jobs)
      .set({ output: sql`jsonb_set(${jobs.output}, '{finalizing,at}', to_jsonb(now() - make_interval(secs => ${FINALIZE_LEASE_SEC - 10})))` })
      .where(eq(jobs.id, job.id));
    const leaseAge = async () => {
      const [row] = await db
        .select({ age: sql<number>`extract(epoch from now() - (${jobs.output} -> 'finalizing' ->> 'at')::timestamptz)` })
        .from(jobs)
        .where(eq(jobs.id, job.id));
      return Number(row!.age);
    };
    expect(await leaseAge()).toBeGreaterThan(FINALIZE_LEASE_SEC - 20);
    // ...the heartbeat renews it.
    vi.advanceTimersByTime(FINALIZE_RENEW_INTERVAL_MS);
    for (let i = 0; i < 100 && (await leaseAge()) > 60; i++) await new Promise((r) => setTimeout(r, 5));
    expect(await leaseAge()).toBeLessThan(60);

    // A cron pass once the original lease would have expired can't take over.
    await db
      .update(jobs)
      .set({ lastPolledAt: null })
      .where(eq(jobs.id, job.id));
    const other = await syncJob(job.id, { force: true });
    expect(other.status).toBe("running");
    expect(other.attempts).toBe(1);

    weightsFetch.parked!();
    const done = await slow;
    expect(done.status).toBe("succeeded");
    expect(done.attempts).toBe(1);
  });
});
