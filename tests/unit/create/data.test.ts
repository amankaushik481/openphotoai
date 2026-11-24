import { beforeEach, describe, expect, it } from "vitest";
import { loadDraftAllowance, loadModelModes } from "@/app/app/create/data";
import { generateCost } from "@/components/create/logic";
import { creditCost, DRAFT_DAILY_LIMIT, DRAFT_DAILY_LIMIT_FREE } from "@/config/credits";
import { getHandler } from "@/server/jobs/handlers";
import { rateLimit } from "@/server/rate-limit";
import { generateJobInput, QUALITY_LEVELS } from "@/types/domain";
import { createTestDb, createTestModel, createTestUser } from "../../helpers/factories";

beforeEach(async () => {
  await createTestDb();
});

describe("loadModelModes", () => {
  it("maps the user's own, non-deleted models to their identity mode", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const trained = await createTestModel(user.id);
    const instant = await createTestModel(user.id, { metadata: { mode: "instant" }, providerModelRef: null });
    const legacy = await createTestModel(user.id, { metadata: {} });
    await createTestModel(user.id, { deletedAt: new Date() });
    await createTestModel(other.id, { metadata: { mode: "instant" } });

    expect(await loadModelModes(user.id)).toEqual({
      [trained.id]: "trained",
      [instant.id]: "instant",
      [legacy.id]: "trained",
    });
  });
});

describe("loadDraftAllowance", () => {
  it("reports the daily allowance without consuming a draft", async () => {
    const paid = await createTestUser({ hasPaid: true });
    const free = await createTestUser({ hasPaid: false });

    expect(await loadDraftAllowance(paid)).toMatchObject({ limit: DRAFT_DAILY_LIMIT, remaining: DRAFT_DAILY_LIMIT });
    expect(await loadDraftAllowance(paid)).toMatchObject({ remaining: DRAFT_DAILY_LIMIT });
    expect(await loadDraftAllowance(free)).toMatchObject({ limit: DRAFT_DAILY_LIMIT_FREE, remaining: DRAFT_DAILY_LIMIT_FREE });

    // The engine charges one unit per draft job.
    await rateLimit("draftsPerDayFree", `user:${free.id}`);
    await rateLimit("draftsPerDayFree", `user:${free.id}`);
    const after = await loadDraftAllowance(free);
    expect(after.remaining).toBe(DRAFT_DAILY_LIMIT_FREE - 2);
    expect(new Date(after.resetAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("UI cost estimate vs. the generate handler", () => {
  it("matches what the server charges for trained and instant models", async () => {
    const user = await createTestUser();
    const trained = await createTestModel(user.id);
    const instant = await createTestModel(user.id, { metadata: { mode: "instant" } });
    const handler = getHandler("generate");

    for (const [model, mode] of [
      [trained, "trained"],
      [instant, "instant"],
    ] as const) {
      for (const quality of QUALITY_LEVELS) {
        const input = generateJobInput.parse({ type: "generate", modelId: model.id, prompt: "portrait", quality, numImages: 3 });
        const plan = await handler.plan({ user, input });
        expect(generateCost({ quality, numImages: 3, mode })).toBe(plan.credits ?? creditCost(input));
      }
    }
  });
});
