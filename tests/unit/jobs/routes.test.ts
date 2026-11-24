import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as cancelJobRoute } from "@/app/api/jobs/[id]/cancel/route";
import { GET as getJobRoute } from "@/app/api/jobs/[id]/route";
import { GET as listJobsRoute, POST as createJobRoute } from "@/app/api/jobs/route";
import { GET as getBatchRoute } from "@/app/api/batches/[id]/route";
import { POST as createBatchRoute } from "@/app/api/batches/route";
import { GET as cronRoute } from "@/app/api/cron/jobs/route";
import { POST as promptHelperRoute } from "@/app/api/prompt-helper/route";
import { POST as uploadRoute } from "@/app/api/uploads/route";
import { POST as webhookRoute } from "@/app/api/webhooks/ai/[provider]/route";
import { db } from "@/db";
import { jobs, uploads, webhookEvents } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { resetEnvCache } from "@/lib/env";
import { signMockWebhook } from "@/providers/mock/ai";
import { setProviderOverrides } from "@/providers/registry";
import { getStorage } from "@/server/storage";
import { callRoute, createTestDb, createTestModel, createTestUser, sessionMock } from "../../helpers/factories";
import { pngBytes, resetSafety, useTempStorage } from "./fixtures";

vi.mock("@/server/auth/session", () => sessionMock);
vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyMock);
vi.mock("@/providers/registry", async (importOriginal) =>
  importOriginal().catch(async () => (await import("./registry-fallback")).fallbackRegistry),
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
beforeEach(async () => {
  await createTestDb();
  resetSafety();
  setProviderOverrides(null);
  sessionMock.reset();
  u = await createTestUser({ credits: 20, plan: "pro", hasPaid: true });
  modelId = (await createTestModel(u.id)).id;
  sessionMock.setUser(u);
});

const genBody = (over: Record<string, unknown> = {}) => ({
  type: "generate",
  modelId,
  prompt: "portrait of {subject} in a garden",
  numImages: 1,
  ...over,
});

describe("jobs API", () => {
  it("requires a session", async () => {
    sessionMock.setUser(null);
    const res = await callRoute(createJobRoute, { url: "/api/jobs", body: genBody() });
    expect(res.status).toBe(401);
  });

  it("creates, lists, reads (lazy sync) and replays with Idempotency-Key", async () => {
    const first = await callRoute(createJobRoute, {
      url: "/api/jobs",
      body: genBody(),
      headers: { "Idempotency-Key": "abc-123" },
    });
    expect(first.status).toBe(200);
    expect(first.json.job.status).toBe("running");
    const replay = await callRoute(createJobRoute, {
      url: "/api/jobs",
      body: genBody(),
      headers: { "Idempotency-Key": "abc-123" },
    });
    expect(replay.json.job.id).toBe(first.json.job.id);
    expect(await db.select().from(jobs)).toHaveLength(1);

    const read = await callRoute(getJobRoute, { url: `/api/jobs/${first.json.job.id}`, params: { id: first.json.job.id } });
    expect(read.status).toBe(200);
    expect(read.json.job.status).toBe("succeeded");
    expect(read.json.job.media).toHaveLength(1);

    const list = await callRoute(listJobsRoute, { url: "/api/jobs?limit=10" });
    expect(list.json.jobs.map((j: { id: string }) => j.id)).toEqual([first.json.job.id]);
    expect(list.json.nextCursor).toBeNull();
  });

  it("validates bodies and idempotency keys", async () => {
    const bad = await callRoute(createJobRoute, { url: "/api/jobs", body: { type: "generate", modelId } });
    expect(bad.status).toBe(400);
    const badKey = await callRoute(createJobRoute, {
      url: "/api/jobs",
      body: genBody(),
      headers: { "Idempotency-Key": "x".repeat(300) },
    });
    expect(badKey.status).toBe(400);
  });

  it("paginates with a cursor", async () => {
    for (let i = 0; i < 3; i++) await callRoute(createJobRoute, { url: "/api/jobs", body: genBody({ prompt: "portrait [mock:stuck]" }) });
    const page1 = await callRoute(listJobsRoute, { url: "/api/jobs?limit=2" });
    expect(page1.json.jobs).toHaveLength(2);
    expect(page1.json.nextCursor).toBeTruthy();
    const page2 = await callRoute(listJobsRoute, { url: `/api/jobs?limit=2&cursor=${page1.json.nextCursor}` });
    expect(page2.json.jobs).toHaveLength(1);
    const ids = [...page1.json.jobs, ...page2.json.jobs].map((j: { id: string }) => j.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("cancels a job and hides other users' jobs", async () => {
    const created = await callRoute(createJobRoute, { url: "/api/jobs", body: genBody({ prompt: "portrait [mock:stuck]" }) });
    const id = created.json.job.id as string;
    const intruder = await createTestUser();
    sessionMock.setUser(intruder);
    expect((await callRoute(getJobRoute, { url: `/api/jobs/${id}`, params: { id } })).status).toBe(404);
    expect((await callRoute(cancelJobRoute, { url: `/api/jobs/${id}/cancel`, params: { id }, method: "POST" })).status).toBe(404);
    sessionMock.setUser(u);
    const canceled = await callRoute(cancelJobRoute, { url: `/api/jobs/${id}/cancel`, params: { id }, method: "POST" });
    expect(canceled.json.job.status).toBe("canceled");
    expect(canceled.json.job.creditsRefunded).toBe(1);
  });
});

describe("batches API", () => {
  it("creates a batch and reports progress", async () => {
    const res = await callRoute(createBatchRoute, {
      url: "/api/batches",
      body: { modelId, packId: "linkedin-headshots", count: 2 },
    });
    expect(res.status).toBe(200);
    expect(res.json.jobs).toHaveLength(2);
    expect(res.json.requested).toBe(2);
    const id = res.json.batch.id as string;
    const progress = await callRoute(getBatchRoute, { url: `/api/batches/${id}`, params: { id } });
    expect(progress.json.batch).toMatchObject({ total: 2, completed: 2, status: "completed" });
    expect(progress.json.jobs.every((j: { status: string }) => j.status === "succeeded")).toBe(true);
    sessionMock.setUser(await createTestUser());
    expect((await callRoute(getBatchRoute, { url: `/api/batches/${id}`, params: { id } })).status).toBe(404);
  });
});

describe("AI webhooks", () => {
  async function runningJob() {
    const res = await callRoute(createJobRoute, { url: "/api/jobs", body: genBody() });
    const [row] = await db.select().from(jobs).where(eq(jobs.id, res.json.job.id));
    return row!;
  }

  it("rejects a bad signature with 401", async () => {
    const job = await runningJob();
    const rawBody = JSON.stringify({ requestId: job.providerRequestId });
    const res = await callRoute(webhookRoute, {
      url: "/api/webhooks/ai/mock",
      params: { provider: "mock" },
      body: rawBody,
      headers: { "x-mock-signature": "deadbeef" },
    });
    expect(res.status).toBe(401);
    const [row] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row!.status).toBe("running");
  });

  it("completes the job and acknowledges duplicates with 200", async () => {
    const job = await runningJob();
    const rawBody = JSON.stringify({ requestId: job.providerRequestId, status: "completed" });
    const send = () =>
      callRoute(webhookRoute, {
        url: "/api/webhooks/ai/mock",
        params: { provider: "mock" },
        body: rawBody,
        headers: { "x-mock-signature": signMockWebhook(rawBody), "content-type": "application/json" },
      });
    const first = await send();
    expect(first.status).toBe(200);
    expect(first.json.jobId).toBe(job.id);
    const [row] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row!.status).toBe("succeeded");
    const dup = await send();
    expect(dup.status).toBe(200);
    const events = await db.select().from(webhookEvents);
    expect(events).toHaveLength(1);
    expect(events[0]!.processedAt).not.toBeNull();
  });

  it("404s unknown providers", async () => {
    const res = await callRoute(webhookRoute, { url: "/api/webhooks/ai/nope", params: { provider: "nope" }, body: "{}" });
    expect(res.status).toBe(404);
  });
});

describe("cron", () => {
  it("requires the CRON_SECRET bearer token", async () => {
    sessionMock.setUser(null);
    expect((await callRoute(cronRoute, { url: "/api/cron/jobs" })).status).toBe(401);
    expect((await callRoute(cronRoute, { url: "/api/cron/jobs", headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    const ok = await callRoute(cronRoute, { url: "/api/cron/jobs", headers: { authorization: "Bearer test-cron-secret" } });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ checked: 0, completed: 0, failed: 0 });
  });

  it("refuses requests when CRON_SECRET is unset in production", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    resetEnvCache();
    try {
      const res = await callRoute(cronRoute, { url: "/api/cron/jobs", headers: { authorization: "Bearer " } });
      expect(res.status).toBe(401);
    } finally {
      vi.unstubAllEnvs();
      resetEnvCache();
    }
  });
});

describe("uploads", () => {
  function form(file: Blob, purpose = "reference", name = "photo.png") {
    const fd = new FormData();
    fd.set("purpose", purpose);
    fd.set("file", file, name);
    return fd;
  }

  it("stores a normalized reference image", async () => {
    const res = await callRoute(uploadRoute, { url: "/api/uploads", body: form(new Blob([await pngBytes(80, 60)], { type: "image/png" })) });
    expect(res.status).toBe(200);
    expect(res.json.upload).toMatchObject({ width: 80, height: 60 });
    const [row] = await db.select().from(uploads).where(eq(uploads.id, res.json.upload.id));
    expect(row).toMatchObject({ userId: u.id, purpose: "reference", mimeType: "image/jpeg" });
    expect(row!.storageKey.startsWith(`users/${u.id}/uploads/`)).toBe(true);
    expect(await getStorage().exists(row!.storageKey)).toBe(true);
  });

  it("keeps masks as PNG and rejects non-PNG masks", async () => {
    const png = await pngBytes(32, 32);
    const ok = await callRoute(uploadRoute, { url: "/api/uploads", body: form(new Blob([png], { type: "image/png" }), "mask") });
    expect(ok.status).toBe(200);
    const [row] = await db.select().from(uploads).where(eq(uploads.id, ok.json.upload.id));
    expect(row!.mimeType).toBe("image/png");

    const sharp = (await import("sharp")).default;
    const jpeg = Uint8Array.from(await sharp(png).jpeg().toBuffer());
    const bad = await callRoute(uploadRoute, { url: "/api/uploads", body: form(new Blob([jpeg], { type: "image/jpeg" }), "mask", "m.jpg") });
    expect(bad.status).toBe(400);
  });

  it("rejects files over 8 MB", async () => {
    const big = new Uint8Array(8 * 1024 * 1024 + 10);
    big.set(await pngBytes(), 0);
    const res = await callRoute(uploadRoute, { url: "/api/uploads", body: form(new Blob([big], { type: "image/png" })) });
    expect(res.status).toBe(413);
    expect(res.json.error.code).toBe("payload_too_large");
  });

  it("rejects non-images and bad purposes", async () => {
    const text = new Blob([new TextEncoder().encode("hello, this is definitely not an image")], { type: "image/png" });
    const res = await callRoute(uploadRoute, { url: "/api/uploads", body: form(text) });
    expect(res.status).toBe(400);
    const purpose = await callRoute(uploadRoute, {
      url: "/api/uploads",
      body: form(new Blob([await pngBytes()], { type: "image/png" }), "consent"),
    });
    expect(purpose.status).toBe(400);
    expect(await db.select().from(uploads)).toHaveLength(0);
  });
});

describe("prompt helper", () => {
  it("returns an optimized prompt and blocks disallowed requests", async () => {
    const ok = await callRoute(promptHelperRoute, { url: "/api/prompt-helper", body: { request: "me on a yacht at sunset", modelId } });
    expect(ok.status).toBe(200);
    expect(typeof ok.json.prompt).toBe("string");
    expect(ok.json.prompt.length).toBeGreaterThan(10);
    const blocked = await callRoute(promptHelperRoute, { url: "/api/prompt-helper", body: { request: "forbidden-word please" } });
    expect(blocked.status).toBe(422);
  });

  it("falls back to a template when the LLM fails", async () => {
    const { overrideMockAI } = await import("./fixtures");
    overrideMockAI({
      promptHelper: async () => {
        throw new Error("llm down");
      },
    });
    const res = await callRoute(promptHelperRoute, { url: "/api/prompt-helper", body: { request: "hiking in the alps" } });
    expect(res.status).toBe(200);
    expect(res.json.prompt).toContain("hiking in the alps");
  });
});
