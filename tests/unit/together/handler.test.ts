import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { jobs, media } from "@/db/schema";
import type { IdentityModelRow, UserRow } from "@/db/types";
import { createMockAIProvider } from "@/providers/mock/ai";
import { setProviderOverrides } from "@/providers/registry";
import type { EditInput } from "@/providers/types";
import { getBalance } from "@/server/credits/ledger";
import { createJob, syncJob } from "@/server/jobs/engine";
import type { MultiPersonPlanData } from "@/server/jobs/handlers/multi-person";
import { revokeShare } from "@/server/together/invites";
import type { JobInput } from "@/types/domain";
import { createTestDb, createTestModel, createTestUser } from "../../helpers/factories";
import { addReferencePhoto, eventsOf, insertShare, useTempStorage } from "./helpers";

let cleanupStorage: () => Promise<void>;
beforeAll(async () => {
  cleanupStorage = await useTempStorage();
});
afterAll(async () => {
  await cleanupStorage();
});

let alice: UserRow; // requester
let bob: UserRow; // shares his model with alice
let eve: UserRow; // stranger
let aliceModel: IdentityModelRow;
let bobModel: IdentityModelRow;
let edits: EditInput[];

beforeEach(async () => {
  await createTestDb();
  alice = await createTestUser({ name: "Alice", email: "alice@example.com", credits: 30, plan: "pro", hasPaid: true });
  bob = await createTestUser({ name: "Bob", email: "bob@example.com", credits: 30, plan: "pro", hasPaid: true });
  eve = await createTestUser({ name: "Eve", email: "eve@example.com", credits: 30, plan: "pro", hasPaid: true });
  aliceModel = await createTestModel(alice.id, { name: "Alice", subject: "woman" });
  bobModel = await createTestModel(bob.id, { name: "Bob", subject: "man" });
  await addReferencePhoto(aliceModel);
  await addReferencePhoto(bobModel);

  edits = [];
  const provider = createMockAIProvider();
  const original = provider.submitEdit.bind(provider);
  provider.submitEdit = async (input, opts) => {
    edits.push(input);
    return original(input, opts);
  };
  setProviderOverrides({ image: provider, training: provider, video: provider });
});
afterEach(() => {
  setProviderOverrides(null);
});

const together = (over: Partial<Extract<JobInput, { type: "multi_person" }>> = {}): JobInput =>
  ({
    type: "multi_person",
    modelIds: [aliceModel.id, bobModel.id],
    prompt: "dancing at a friend's wedding, golden hour",
    aspectRatio: "4:5",
    numImages: 2,
    ...over,
  }) as JobInput;

async function jobCount() {
  return (await db.select().from(jobs)).length;
}

describe("multi_person handler", () => {
  it("is forbidden without an accepted share, records the attempt and charges nothing", async () => {
    await expect(createJob(alice, together())).rejects.toMatchObject({ code: "forbidden" });
    expect(await jobCount()).toBe(0);
    expect(await getBalance(alice.id)).toBe(30);
    const [event] = await eventsOf(alice.id, "multi_person_unauthorized");
    expect(event!.details).toMatchObject({ unauthorizedModelIds: [bobModel.id] });
    expect(edits).toHaveLength(0);
  });

  it("refuses pending, declined, revoked and expired shares", async () => {
    for (const status of ["pending", "declined", "revoked"] as const) {
      await insertShare({ requester: alice, owner: bob, model: bobModel, status });
    }
    await insertShare({ requester: alice, owner: bob, model: bobModel, expiresAt: new Date(Date.now() - 1000) });
    await expect(createJob(alice, together())).rejects.toMatchObject({ code: "forbidden" });
    expect(await jobCount()).toBe(0);
  });

  it("creates a together photo with an accepted share", async () => {
    await insertShare({ requester: alice, owner: bob, model: bobModel });
    const job = await createJob(alice, together({ numImages: 2 }));
    expect(job.status).toBe("running");
    expect(job.creditsCharged).toBe(6); // 3 credits per image
    expect(job.modelId).toBe(aliceModel.id);
    expect(await getBalance(alice.id)).toBe(24);
    expect(await getBalance(bob.id)).toBe(30);

    const plan = job.output?.plan as MultiPersonPlanData;
    expect(plan.modelIds).toEqual([aliceModel.id, bobModel.id]);
    expect(plan.sharedModelIds).toEqual([bobModel.id]);
    expect(plan.scoreLikeness).toBe(false);
    expect(plan.prompt).toBe(
      `photo of ${aliceModel.triggerWord} woman and ${bobModel.triggerWord} man together, dancing at a friend's wedding, golden hour`,
    );

    expect(edits).toHaveLength(1);
    const sent = edits[0]!;
    expect(sent.mode).toBe("multi_person");
    expect(sent.prompt).toBe(plan.prompt);
    expect(sent.numImages).toBe(2);
    expect(sent.aspectRatio).toBe("4:5");
    expect(sent.identities?.map((i) => i.triggerWord)).toEqual([aliceModel.triggerWord, bobModel.triggerWord]);
    for (const identity of sent.identities ?? []) expect(identity.referenceImageUrls?.length).toBe(1);

    const done = await syncJob(job.id);
    expect(done.status).toBe("succeeded");
    const rows = await db.select().from(media).where(eq(media.jobId, job.id));
    expect(rows).toHaveLength(2);
    for (const m of rows) {
      expect(m.userId).toBe(alice.id); // results land in the requester's gallery only
      expect(m.modelId).toBe(aliceModel.id);
      expect(m.scores?.likeness).toBeUndefined();
    }
  });

  it("renders a pack for two people", async () => {
    await insertShare({ requester: alice, owner: bob, model: bobModel });
    const job = await createJob(alice, together({ prompt: undefined, packId: "paris", numImages: 1 }));
    expect(job.packId).toBe("paris");
    expect(job.creditsCharged).toBe(3);
    const plan = job.output?.plan as MultiPersonPlanData;
    expect(plan.packTitle).toBeTruthy();
    expect(plan.prompt).toContain(`${aliceModel.triggerWord} woman and ${bobModel.triggerWord} man`);
    await expect(createJob(alice, together({ prompt: undefined, packId: "no-such-pack" }))).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("moderates the user's prompt", async () => {
    await insertShare({ requester: alice, owner: bob, model: bobModel });
    await expect(createJob(alice, together({ prompt: "a sexy photo of us" }))).rejects.toMatchObject({
      code: "content_blocked",
    });
    expect(await jobCount()).toBe(0);
    expect(await getBalance(alice.id)).toBe(30);
  });

  it("a revoked share blocks new jobs but running jobs finish", async () => {
    const { share } = await insertShare({ requester: alice, owner: bob, model: bobModel });
    const running = await createJob(alice, together({ numImages: 1 }));
    await revokeShare(bob, share.id);

    await expect(createJob(alice, together())).rejects.toMatchObject({ code: "forbidden" });
    expect(await eventsOf(alice.id, "multi_person_unauthorized")).toHaveLength(1);

    const done = await syncJob(running.id);
    expect(done.status).toBe("succeeded");
    expect(done.output?.mediaIds).toHaveLength(1);
  });

  it("requires one of the requester's own models", async () => {
    const carol = await createTestUser({ email: "carol@example.com" });
    const carolModel = await createTestModel(carol.id, { name: "Carol" });
    await addReferencePhoto(carolModel);
    await insertShare({ requester: alice, owner: bob, model: bobModel });
    await insertShare({ requester: alice, owner: carol, model: carolModel });

    await expect(createJob(alice, together({ modelIds: [bobModel.id, carolModel.id] }))).rejects.toMatchObject({
      code: "forbidden",
    });
    const [event] = await eventsOf(alice.id, "multi_person_unauthorized");
    expect(event!.details).toMatchObject({ reason: "no_own_model" });
    expect(await jobCount()).toBe(0);
  });

  it("allows two of the user's own models", async () => {
    const second = await createTestModel(alice.id, { name: "Alice 2" });
    await addReferencePhoto(second);
    const job = await createJob(alice, together({ modelIds: [aliceModel.id, second.id] }));
    expect(job.status).toBe("running");
    expect((job.output?.plan as MultiPersonPlanData).sharedModelIds).toEqual([]);
  });

  it("needs reference photos for both people", async () => {
    const bare = await createTestModel(alice.id, { name: "No photos" });
    await expect(createJob(alice, together({ modelIds: [aliceModel.id, bare.id] }))).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await jobCount()).toBe(0);
  });

  it("refuses models that aren't ready", async () => {
    await insertShare({ requester: alice, owner: bob, model: bobModel });
    const training = await createTestModel(alice.id, { status: "training" });
    await expect(createJob(alice, together({ modelIds: [training.id, bobModel.id] }))).rejects.toMatchObject({
      code: "conflict",
    });
  });

  describe("IDOR", () => {
    it("sharing is one-directional: the owner can't use the requester's model", async () => {
      await insertShare({ requester: alice, owner: bob, model: bobModel });
      await expect(createJob(bob, together({ modelIds: [bobModel.id, aliceModel.id] }))).rejects.toMatchObject({
        code: "forbidden",
      });
    });

    it("a share covers only the model the owner picked", async () => {
      const bobOther = await createTestModel(bob.id, { name: "Bob private" });
      await addReferencePhoto(bobOther);
      await insertShare({ requester: alice, owner: bob, model: bobModel });
      await expect(createJob(alice, together({ modelIds: [aliceModel.id, bobOther.id] }))).rejects.toMatchObject({
        code: "forbidden",
      });
    });

    it("a share for one requester doesn't let anyone else use the model", async () => {
      await insertShare({ requester: alice, owner: bob, model: bobModel });
      const eveModel = await createTestModel(eve.id);
      await addReferencePhoto(eveModel);
      await expect(createJob(eve, together({ modelIds: [eveModel.id, bobModel.id] }))).rejects.toMatchObject({
        code: "forbidden",
      });
    });

    it("unknown model ids are forbidden", async () => {
      await expect(createJob(alice, together({ modelIds: [aliceModel.id, "mdl_doesnotexist"] }))).rejects.toMatchObject({
        code: "forbidden",
      });
    });
  });

  it("validates the input (two distinct models, prompt or pack)", async () => {
    await expect(createJob(alice, together({ modelIds: [aliceModel.id, aliceModel.id] }))).rejects.toThrow();
    await expect(createJob(alice, together({ prompt: undefined }))).rejects.toThrow();
    expect(await jobCount()).toBe(0);
  });
});

describe("handler registry", () => {
  it("exposes the multi_person handler", async () => {
    const { getHandler } = await import("@/server/jobs/handlers");
    const handler = getHandler("multi_person");
    expect(handler.type).toBe("multi_person");
    expect(vi.isMockFunction(handler.plan)).toBe(false);
  });
});
