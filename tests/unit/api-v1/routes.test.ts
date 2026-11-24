/**
 * Public API v1 through real API-key auth (no session mock): scopes, plan gating, rate limits and
 * every endpoint against the mock AI provider.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { apiKeys, batches, jobs, media, modelShares, uploads, user as userTable } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { setProviderOverrides } from "@/providers/registry";
import { createApiKey, revokeApiKey } from "@/server/auth/api-keys";
import { v1Operations, type V1Operation, type V1OperationName } from "@/server/openapi/operations";
import { checkRateLimit } from "@/server/rate-limit";
import type { ApiKeyScope } from "@/types/domain";
import { callRoute, createTestDb, createTestMedia, createTestModel, createTestUser } from "../../helpers/factories";
import { pngBytes, resetSafety, useTempStorage } from "../jobs/fixtures";
import { V1_HANDLERS } from "./routes";

// Deterministic safety fakes from the job-engine tests; other exports (e.g. SAFETY_POLICY) stay real.
vi.mock("@/server/safety", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import("../jobs/fixtures")).safetyMock,
}));
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
let key: string;
beforeEach(async () => {
  await createTestDb();
  resetSafety();
  setProviderOverrides(null);
  u = await createTestUser({ credits: 20, plan: "pro", hasPaid: true });
  modelId = (await createTestModel(u.id)).id;
  key = await newKey(u);
});

async function newKey(user: UserRow, scopes: ApiKeyScope[] = ["*"]): Promise<string> {
  const created = await createApiKey(user.id, "test");
  if (scopes.join() !== "*") await db.update(apiKeys).set({ scopes }).where(eq(apiKeys.id, created.row.id));
  return created.key;
}

interface Call {
  key?: string | null;
  params?: Record<string, string>;
  query?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Call an operation's handler with a Bearer key (defaults to the test user's `*` key). */
function call(name: V1OperationName, opts: Call = {}) {
  const op: V1Operation = v1Operations[name];
  const path = op.path.replace(/\{(\w+)\}/g, (_, p: string) => opts.params?.[p] ?? "x");
  const k = opts.key === undefined ? key : opts.key;
  return callRoute(V1_HANDLERS[name], {
    method: op.method.toUpperCase(),
    url: `/api/v1${path}${opts.query ? `?${opts.query}` : ""}`,
    params: opts.params ?? {},
    body: opts.body ?? (op.method === "post" && op.body ? {} : undefined),
    headers: { ...(k ? { authorization: `Bearer ${k}` } : {}), ...opts.headers },
  });
}

const genBody = (over: Record<string, unknown> = {}) => ({
  type: "generate",
  modelId,
  prompt: "portrait of {subject} in a garden",
  numImages: 1,
  ...over,
});

const scopedOps = (Object.entries(v1Operations) as [V1OperationName, V1Operation][]).filter(([, op]) => op.scope);

describe("authentication", () => {
  it.each(scopedOps)("%s answers 401 with the JSON error shape without a key", async (name) => {
    const res = await call(name, { key: null, params: { id: "x" } });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.json).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
  });

  it("rejects unknown, malformed and revoked keys", async () => {
    for (const bad of ["os_live_nope", "not-a-key", `os_live_${"x".repeat(32)}`]) {
      const res = await call("listModels", { key: bad });
      expect(res.status).toBe(401);
      expect(res.json.error.code).toBe("unauthorized");
    }
    const created = await createApiKey(u.id, "revoked");
    await revokeApiKey(u.id, created.row.id);
    expect((await call("listModels", { key: created.key })).status).toBe(401);
  });

  it("gates on the owner's plan (free / starter keys get 403 plan_limit)", async () => {
    for (const plan of ["free", "starter"] as const) {
      const user = await createTestUser({ plan });
      const res = await call("listModels", { key: await newKey(user) });
      expect(res.status).toBe(403);
      expect(res.json.error.code).toBe("plan_limit");
    }
    // A downgraded account loses API access immediately.
    await db.update(userTable).set({ plan: "free" }).where(eq(userTable.id, u.id));
    expect((await call("getCredits")).json.error.code).toBe("plan_limit");
  });

  it("refuses suspended accounts", async () => {
    const banned = await createTestUser({ plan: "pro", banned: true });
    const res = await call("listJobs", { key: await newKey(banned) });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("suspended");
  });
});

describe("scopes", () => {
  it.each(scopedOps)("%s requires its scope", async (name, op) => {
    const other: ApiKeyScope = op.scope === "read" ? "generate" : "read";
    const res = await call(name, { key: await newKey(u, [other]), params: { id: "x" } });
    expect(res.status).toBe(403);
    expect(res.json.error).toMatchObject({ code: "forbidden", message: expect.stringContaining(`"${op.scope}"`) });
    expect(await db.select().from(jobs)).toHaveLength(0);
  });

  it("read keys read, generate keys create, * keys do both", async () => {
    const reader = await newKey(u, ["read"]);
    const writer = await newKey(u, ["generate"]);
    expect((await call("listModels", { key: reader })).status).toBe(200);
    const created = await call("createJob", { key: writer, body: genBody() });
    expect(created.status).toBe(200);
    const id = created.json.job.id as string;
    expect((await call("getJob", { key: writer, params: { id } })).status).toBe(403);
    expect((await call("getJob", { key: reader, params: { id } })).status).toBe(200);
    const both = await newKey(u, ["read", "generate"]);
    expect((await call("createJob", { key: both, body: genBody() })).status).toBe(200);
    expect((await call("listJobs", { key: both })).status).toBe(200);
  });
});

describe("rate limits", () => {
  it("sends X-RateLimit-* headers and no-store", async () => {
    const res = await call("listPacks");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-limit")).toBe("120");
    expect(res.headers.get("x-ratelimit-remaining")).toBe("119");
    expect(Number(res.headers.get("x-ratelimit-reset"))).toBeGreaterThan(Date.now() / 1000);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect((await call("listPacks")).headers.get("x-ratelimit-remaining")).toBe("118");
  });

  it("answers 429 with Retry-After once a key is over its limit", async () => {
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.userId, u.id));
    await checkRateLimit("apiPerMinute", `key:${row!.id}`, 120);
    const res = await call("listPacks");
    expect(res.status).toBe(429);
    expect(res.json.error.code).toBe("rate_limited");
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    // Other keys have their own budget.
    expect((await call("listPacks", { key: await newKey(u) })).status).toBe(200);
  });
});

describe("jobs", () => {
  it("creates (recording the key), reads with lazy sync, lists and debits credits", async () => {
    const created = await call("createJob", { body: genBody() });
    expect(created.status).toBe(200);
    expect(created.json.job).toMatchObject({ type: "generate", status: "running", creditsCharged: 1, modelId });
    const id = created.json.job.id as string;
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    const [keyRow] = await db.select().from(apiKeys).where(eq(apiKeys.userId, u.id));
    expect(row!.apiKeyId).toBe(keyRow!.id);

    const read = await call("getJob", { params: { id } });
    expect(read.json.job.status).toBe("succeeded");
    expect(read.json.job.media).toHaveLength(1);
    expect(read.json.job.media[0].downloadUrl).toMatch(/^http/);

    const listed = await call("listJobs", { query: "limit=5&status=succeeded" });
    expect(listed.json).toEqual({ jobs: [expect.objectContaining({ id })], nextCursor: null });

    const credits = await call("getCredits");
    expect(credits.json.balance).toBe(19);
    expect(credits.json.ledger[0]).toMatchObject({ delta: -1, reason: "job_debit", jobId: id });
  });

  it("replays an Idempotency-Key instead of charging twice", async () => {
    const headers = { "Idempotency-Key": "order-42" };
    const first = await call("createJob", { body: genBody(), headers });
    const replay = await call("createJob", { body: genBody({ prompt: "something else" }), headers });
    expect(replay.status).toBe(200);
    expect(replay.json.job.id).toBe(first.json.job.id);
    expect(await db.select().from(jobs)).toHaveLength(1);
    expect((await call("getCredits")).json.balance).toBe(19);
    const bad = await call("createJob", { body: genBody(), headers: { "Idempotency-Key": "x".repeat(201) } });
    expect(bad.status).toBe(400);
  });

  it("validates bodies with the shared schema", async () => {
    const res = await call("createJob", { body: { type: "generate", modelId } });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("validation_error");
    expect((await call("createJob", { body: { type: "train", modelId } })).status).toBe(400);
    expect((await call("listJobs", { query: "limit=1000" })).status).toBe(400);
  });

  it("cancels with a refund and hides other users' jobs", async () => {
    const created = await call("createJob", { body: genBody({ prompt: "portrait [mock:stuck]" }) });
    const id = created.json.job.id as string;
    const intruder = await newKey(await createTestUser({ plan: "studio" }));
    expect((await call("getJob", { key: intruder, params: { id } })).status).toBe(404);
    expect((await call("cancelJob", { key: intruder, params: { id } })).status).toBe(404);
    const canceled = await call("cancelJob", { params: { id } });
    expect(canceled.json.job).toMatchObject({ status: "canceled", creditsRefunded: 1 });
  });

  it("polls several jobs with ?ids=", async () => {
    const a = (await call("createJob", { body: genBody() })).json.job.id as string;
    const b = (await call("createJob", { body: genBody() })).json.job.id as string;
    const res = await call("listJobs", { query: `ids=${a},${b}` });
    expect(res.json.jobs.map((j: { status: string }) => j.status)).toEqual(["succeeded", "succeeded"]);
  });
});

describe("batches", () => {
  it("creates a batch with the key recorded and reports progress", async () => {
    const res = await call("createBatch", { body: { modelId, packId: "linkedin-headshots", count: 2 } });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ requested: 2, stoppedReason: null });
    expect(res.json.jobs).toHaveLength(2);
    const id = res.json.batch.id as string;
    const rows = await db.select().from(jobs).where(eq(jobs.batchId, id));
    expect(rows.every((r) => r.apiKeyId !== null)).toBe(true);

    const progress = await call("getBatch", { params: { id } });
    expect(progress.json.batch).toMatchObject({ total: 2, completed: 2, status: "completed" });
    const other = await newKey(await createTestUser({ plan: "pro" }));
    expect((await call("getBatch", { key: other, params: { id } })).status).toBe(404);
    expect(await db.select().from(batches)).toHaveLength(1);
  });
});

describe("batches idempotency", () => {
  it("replays an Idempotency-Key with the original batch", async () => {
    const body = { modelId, packId: "linkedin-headshots", count: 2 };
    const headers = { "idempotency-key": "v1-batch-1" };
    const first = await call("createBatch", { body, headers });
    const again = await call("createBatch", { body, headers });
    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(again.json.batch.id).toBe(first.json.batch.id);
    expect(await db.select().from(batches)).toHaveLength(1);
    const [owner] = await db.select().from(userTable).where(eq(userTable.id, u.id));
    expect(owner!.credits).toBe(18);
  });
});

describe("uploads", () => {
  const form = async (purpose: string, bytes?: Uint8Array<ArrayBuffer>) => {
    const fd = new FormData();
    fd.set("file", new Blob([bytes ?? (await pngBytes(96, 120))], { type: "image/png" }), "in.png");
    fd.set("purpose", purpose);
    return fd;
  };

  it("stores references (as JPEG) and masks (as PNG) for the key's owner", async () => {
    const ref = await call("createUpload", { body: await form("reference") });
    expect(ref.status).toBe(200);
    expect(ref.json.upload).toMatchObject({ id: expect.stringMatching(/^upl_/), width: 96, height: 120 });
    expect(ref.json.upload.url).toMatch(/^http/);
    expect(ref.headers.get("x-ratelimit-limit")).toBeTruthy();
    const mask = await call("createUpload", { body: await form("mask") });
    expect(mask.status).toBe(200);
    const rows = await db.select().from(uploads).where(eq(uploads.userId, u.id));
    expect(rows.map((r) => [r.purpose, r.mimeType]).sort()).toEqual([
      ["mask", "image/png"],
      ["reference", "image/jpeg"],
    ]);
    // The upload is usable as a job input over the API.
    const job = await call("createJob", { body: { type: "pose_copy", modelId, referenceUploadId: ref.json.upload.id } });
    expect(job.status).toBe(200);
  });

  it("validates purpose and file type", async () => {
    expect((await call("createUpload", { body: await form("selfie") })).status).toBe(400);
    const text = await call("createUpload", { body: await form("reference", Uint8Array.from(new TextEncoder().encode("hello"))) });
    expect(text.status).toBe(400);
    expect((await call("createUpload", { body: JSON.stringify({ purpose: "reference" }), headers: { "content-type": "application/json" } })).status).toBe(400);
  });
});

describe("models", () => {
  it("lists own and shared models; hides unshared ones", async () => {
    const friend = await createTestUser({ plan: "free", name: "Friend" });
    const sharedModel = await createTestModel(friend.id, { name: "Friend's model" });
    const pendingModel = await createTestModel(friend.id, { name: "Pending" });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await db.insert(modelShares).values([
      {
        requesterUserId: u.id,
        inviteeEmail: friend.email,
        ownerUserId: friend.id,
        modelId: sharedModel.id,
        status: "accepted",
        tokenHash: "h1",
        expiresAt,
      },
      {
        requesterUserId: u.id,
        inviteeEmail: friend.email,
        ownerUserId: friend.id,
        modelId: pendingModel.id,
        status: "pending",
        tokenHash: "h2",
        expiresAt,
      },
    ]);

    const res = await call("listModels");
    expect(res.status).toBe(200);
    expect(res.json.models.map((m: { id: string }) => m.id)).toEqual([modelId, sharedModel.id]);
    expect(res.json.models[1]).toMatchObject({ shared: true, ownerName: "Friend" });

    const own = await call("getModel", { params: { id: modelId } });
    expect(own.json).toEqual({
      model: expect.objectContaining({ id: modelId, shared: false, mode: "trained" }),
      photos: [],
      readiness: expect.objectContaining({ canTrain: expect.any(Boolean) }),
      readinessByMode: { instant: expect.any(Object), trained: expect.any(Object) },
    });
    const instant = await call("getModel", { params: { id: modelId }, query: "mode=instant" });
    expect(instant.json.readiness).toEqual(instant.json.readinessByMode.instant);
    expect((await call("getModel", { params: { id: modelId }, query: "mode=nope" })).status).toBe(400);
    const shared = await call("getModel", { params: { id: sharedModel.id } });
    expect(shared.json.model.shared).toBe(true);
    expect(shared.json.photos).toEqual([]);
    const hidden = await call("getModel", { params: { id: pendingModel.id } });
    expect(hidden.status).toBe(404);
    expect(hidden.json.error.code).toBe("not_found");
  });
});

describe("media", () => {
  it("lists live media with filters and cursor pagination; reads one item", async () => {
    const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s));
    const m1 = await createTestMedia(u.id, { createdAt: t(1), isFavorite: true });
    const m2 = await createTestMedia(u.id, { createdAt: t(2), kind: "video", mimeType: "video/mp4" });
    const m3 = await createTestMedia(u.id, { createdAt: t(3) });
    const hidden = await createTestMedia(u.id, { createdAt: t(4), hidden: true });
    await createTestMedia(u.id, { createdAt: t(5), deletedAt: new Date() });
    const foreign = await createTestMedia((await createTestUser()).id, { createdAt: t(6) });

    const all = await call("listMedia");
    expect(all.json.media.map((m: { id: string }) => m.id)).toEqual([m3.id, m2.id, m1.id]);
    expect(all.json.hiddenCount).toBe(1);
    const withHidden = await call("listMedia", { query: "showHidden=true" });
    expect(withHidden.json.media[0].id).toBe(hidden.id);
    expect((await call("listMedia", { query: "kind=video" })).json.media.map((m: { id: string }) => m.id)).toEqual([
      m2.id,
    ]);
    expect((await call("listMedia", { query: "favorite=1" })).json.media.map((m: { id: string }) => m.id)).toEqual([
      m1.id,
    ]);

    const page1 = await call("listMedia", { query: "limit=2" });
    expect(page1.json.media).toHaveLength(2);
    const page2 = await call("listMedia", { query: `limit=2&cursor=${page1.json.nextCursor}` });
    expect(page2.json).toEqual({ media: [expect.objectContaining({ id: m1.id })], nextCursor: null });
    expect((await call("listMedia", { query: "cursor=garbage" })).status).toBe(400);
    expect((await call("listMedia", { query: "favorite=maybe" })).status).toBe(400);

    const one = await call("getMedia", { params: { id: m1.id } });
    expect(one.json.media).toMatchObject({ id: m1.id, isFavorite: true, url: expect.stringMatching(/^http/) });
    expect((await call("getMedia", { params: { id: foreign.id } })).status).toBe(404);
    expect(await db.select().from(media)).toHaveLength(6);
  });
});

describe("packs + credits", () => {
  it("lists pack summaries", async () => {
    const res = await call("listPacks");
    expect(res.json.packs.length).toBeGreaterThan(0);
    expect(res.json.packs.map((p: { slug: string }) => p.slug)).toContain("linkedin-headshots");
  });

  it("returns the balance and a paginated ledger", async () => {
    for (let i = 0; i < 3; i++) await call("createJob", { body: genBody() });
    const page1 = await call("getCredits", { query: "limit=2" });
    expect(page1.json).toMatchObject({ balance: 17, nextCursor: expect.any(String) });
    expect(page1.json.ledger).toHaveLength(2);
    const page2 = await call("getCredits", { query: `limit=2&cursor=${page1.json.nextCursor}` });
    expect(page2.json.ledger).toHaveLength(1);
    expect(page2.json.nextCursor).toBeNull();
  });
});

describe("GET /api/v1/openapi.json", () => {
  it("is public and cacheable", async () => {
    const res = await call("getOpenApiDocument", { key: null });
    expect(res.status).toBe(200);
    expect(res.json.openapi).toBe("3.1.0");
    expect(res.headers.get("cache-control")).toContain("max-age=");
  });
});
