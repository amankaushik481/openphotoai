/**
 * Check-then-act races on plan / model limits (GM-F correctness review, COR-6): parallel requests
 * must not get past a limit that each of them checked before any of them wrote. PGlite interleaves
 * the awaited statements of concurrent requests, so these reproduce without a real server.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as photosRoute } from "@/app/api/models/[id]/photos/route";
import { db } from "@/db";
import { identityModels, jobs, trainingPhotos } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { TRAINING } from "@/config/app";
import { getPlan } from "@/config/plans";
import { setProviderOverrides } from "@/providers/registry";
import { AppError } from "@/server/http";
import { createModel } from "@/server/models/crud";
import type { AddPhotoResponse } from "@/server/models/types";
import { storageKeys } from "@/server/storage";
import type { ApiErrorBody } from "@/types/domain";
import { callRoute, createTestDb, createTestModel, createTestUser, sessionMock } from "../../helpers/factories";
import { embeddingOf, imageForm, selfie, useTempStorage } from "./helpers";

vi.mock("@/server/auth/session", () => sessionMock);

let storage: Awaited<ReturnType<typeof useTempStorage>>;
beforeAll(async () => {
  storage = await useTempStorage();
});
afterAll(async () => {
  await storage.cleanup();
});

let u: UserRow;
beforeEach(async () => {
  await createTestDb();
  setProviderOverrides(null);
  sessionMock.reset();
  u = await createTestUser({ credits: 0, plan: "free" });
  sessionMock.setUser(u);
});

function codes(results: PromiseSettledResult<unknown>[]): string[] {
  return results.map((r) => (r.status === "fulfilled" ? "ok" : r.reason instanceof AppError ? r.reason.code : String(r.reason)));
}

describe("limits under parallel requests", () => {
  it("never creates more identity models than the plan allows", async () => {
    const max = getPlan("free").limits.maxModels;
    const results = await Promise.allSettled(Array.from({ length: 4 }, (_, i) => createModel(u, { name: `M${i}`, subject: "person" })));
    expect(codes(results).filter((c) => c === "ok")).toHaveLength(max);
    expect(codes(results).filter((c) => c !== "ok").every((c) => c === "plan_limit")).toBe(true);
    expect(await db.$count(identityModels, eq(identityModels.userId, u.id))).toBe(max);
  });

  it("never stores more good training photos than a model can use", async () => {
    const model = await createTestModel(u.id, {
      status: "collecting",
      provider: null,
      providerModelRef: null,
      consentEmbedding: embeddingOf("alice"),
    });
    const almost = TRAINING.maxPhotos - 1;
    await db.insert(trainingPhotos).values(
      Array.from({ length: almost }, (_, i) => ({
        modelId: model.id,
        userId: u.id,
        storageKey: storageKeys.trainingPhoto(u.id, model.id, `tph_fake${i}`),
        width: 1024,
        height: 1280,
        status: "accepted" as const,
      })),
    );
    const results = await Promise.all(
      ["alice-02", "alice-03", "alice-04", "alice-05"].map((name) =>
        callRoute<AddPhotoResponse & ApiErrorBody, { id: string }>(photosRoute, {
          url: `/api/models/${model.id}/photos`,
          params: { id: model.id },
          body: imageForm("file", selfie(name)),
        }),
      ),
    );
    const accepted = await db.$count(
      trainingPhotos,
      and(eq(trainingPhotos.modelId, model.id), eq(trainingPhotos.status, "accepted")),
    );
    expect(accepted).toBe(TRAINING.maxPhotos);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status !== 200).every((r) => r.status === 409)).toBe(true);
  });

  it("never runs more jobs at once than the plan's concurrency limit", async () => {
    vi.doMock("@/server/safety", async () => (await import("../jobs/fixtures")).safetyMock);
    const { createJob } = await import("@/server/jobs/engine");
    const payer = await createTestUser({ credits: 50, plan: "free", hasPaid: true });
    const m = await createTestModel(payer.id);
    const limit = getPlan("free").limits.maxConcurrentJobs;
    const results = await Promise.allSettled(
      Array.from({ length: limit + 3 }, (_, i) =>
        createJob(
          payer,
          { type: "generate", modelId: m.id, prompt: `portrait ${i} [mock:stuck]`, numImages: 1, quality: "standard", aspectRatio: "4:5" },
          { skipRateLimit: true },
        ),
      ),
    );
    expect(codes(results).filter((c) => c === "ok")).toHaveLength(limit);
    expect(codes(results).filter((c) => c !== "ok").every((c) => c === "plan_limit")).toBe(true);
    expect(await db.$count(jobs, eq(jobs.userId, payer.id))).toBe(limit);
    vi.doUnmock("@/server/safety");
  });
});
