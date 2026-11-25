/**
 * POST /api/demo/login against PGlite + mock providers: real Better Auth session cookie, real
 * consent / photo / instant-training / batch code paths. GET doubles as the landing-page probe.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, like } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/demo/login/route";
import { db } from "@/db";
import {
  batches,
  consentRecords,
  creditLedger,
  identityModels,
  jobs,
  media,
  session,
  trainingPhotos,
  user,
} from "@/db/schema";
import { resetEnvCache } from "@/lib/env";
import { createLocalStorage } from "@/providers/storage/local";
import { setProviderOverrides } from "@/providers/registry";
import { resetAuth } from "@/server/auth/auth";
import { resolveRequestAuth } from "@/server/auth/session";
import { DEMO_BATCH_SIZE, DEMO_CREDITS, DEMO_PACK_SLUG, isDemoEmail } from "@/server/demo/constants";
import { DEMO_SELFIE_COUNT } from "@/server/demo/selfies";
import { syncJob } from "@/server/jobs/engine";
import { checkRateLimit } from "@/server/rate-limit";
import { setStorageForTesting } from "@/server/storage";
import { createDemoSessionCookies } from "@/server/demo/session";
import { callRoute, createTestDb, createTestUser } from "../../helpers/factories";

/** Lets a test make the demo pack disappear (the first batch then can't start). */
const packs = vi.hoisted(() => ({ hideDemoPack: false }));
vi.mock("@/server/packs/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/packs/registry")>();
  return {
    ...actual,
    getPack: async (slug: string) =>
      packs.hideDemoPack && slug === "linkedin-headshots" ? null : actual.getPack(slug),
  };
});

const APP = "http://localhost:3000";
const ENV_KEYS = ["DEMO_MODE", "TRUSTED_PROXY_HOPS"] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  Object.assign(process.env, values);
  resetEnvCache();
  resetAuth();
}

const demoLogin = (headers: Record<string, string> = {}) =>
  callRoute(POST, { method: "POST", url: "/api/demo/login", headers: { origin: APP, ...headers } });

const demoUsers = () => db.select().from(user).where(like(user.email, "%@demo.invalid"));

let storageDir: string;
beforeAll(async () => {
  storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-demo-"));
  setStorageForTesting(createLocalStorage({ dir: storageDir, baseUrl: APP, secret: "demo-test-secret" }));
});
afterAll(async () => {
  setStorageForTesting(null);
  await fs.rm(storageDir, { recursive: true, force: true });
});

beforeEach(async () => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  await createTestDb();
  setProviderOverrides(null);
  packs.hideDemoPack = false;
  setEnv({ DEMO_MODE: "true", TRUSTED_PROXY_HOPS: "1" });
});

afterEach(() => {
  vi.restoreAllMocks();
  setProviderOverrides(null);
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetEnvCache();
  resetAuth();
});

describe("demo mode off", () => {
  it("404s both the probe and the login, and creates nothing", async () => {
    setEnv({ DEMO_MODE: "false" });
    const probe = await GET();
    expect(probe.status).toBe(404);
    const res = await demoLogin();
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("not_found");
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(await demoUsers()).toHaveLength(0);
  });
});

describe("POST /api/demo/login", () => {
  it("probe says enabled", async () => {
    const probe = await GET();
    expect(probe.status).toBe(200);
    expect(await probe.json()).toEqual({ enabled: true });
  });

  it("creates a demo user with credits, a ready instant model, a batch and a working session cookie", async () => {
    const res = await demoLogin({ "x-forwarded-for": "203.0.113.7", "user-agent": "vitest-demo" });
    expect(res.status).toBe(200);

    const [u] = await demoUsers();
    expect(u).toBeDefined();
    expect(isDemoEmail(u!.email)).toBe(true);
    expect(u!.email).toMatch(/^demo\+[0-9a-f]+@demo\.invalid$/);
    expect(u!.name).toBe("Demo user");
    expect(u!.role).toBe("user");

    // Credits: one demo grant, then the batch's debits.
    const ledger = await db.select().from(creditLedger).where(eq(creditLedger.userId, u!.id));
    const grant = ledger.find((e) => e.reason === "admin_adjust");
    expect(grant).toMatchObject({ delta: DEMO_CREDITS, note: "demo" });
    expect(u!.credits).toBe(ledger.reduce((sum, e) => sum + e.delta, 0));
    expect(u!.credits).toBeLessThan(DEMO_CREDITS);

    // Ready instant model with accepted photos + a demo-seed consent record.
    const [model] = await db.select().from(identityModels).where(eq(identityModels.userId, u!.id));
    expect(model).toMatchObject({ status: "ready", metadata: expect.objectContaining({ mode: "instant" }) });
    expect(model!.consentVerifiedAt).not.toBeNull();
    const photos = await db.select().from(trainingPhotos).where(eq(trainingPhotos.modelId, model!.id));
    // Runtime-rendered synthetic selfies (no test fixtures) pass the real quality + safety checks.
    expect(photos).toHaveLength(DEMO_SELFIE_COUNT - 1);
    expect(photos.every((p) => p.status === "accepted")).toBe(true);
    const [consent] = await db.select().from(consentRecords).where(eq(consentRecords.modelId, model!.id));
    expect(consent!.evidence).toMatchObject({ captureMethod: "demo-seed", demo: true });
    expect(consent!.ipAddress).toBe("203.0.113.7");

    // One pack batch through the real engine; the client is sent to its live page.
    const [batch] = await db.select().from(batches).where(eq(batches.userId, u!.id));
    expect(batch).toMatchObject({ packId: DEMO_PACK_SLUG, modelId: model!.id, total: DEMO_BATCH_SIZE });
    expect(res.json).toEqual({ redirect: `/app/batches/${batch!.id}` });
    const batchJobs = await db.select().from(jobs).where(eq(jobs.batchId, batch!.id));
    expect(batchJobs).toHaveLength(DEMO_BATCH_SIZE);
    expect(batchJobs.every((j) => j.status === "running")).toBe(true);

    // The gallery fills as soon as the jobs are polled (MOCK_JOB_DELAY_MS=0 in tests).
    for (const job of batchJobs) await syncJob(job.id, { force: true });
    const images = await db.select().from(media).where(eq(media.userId, u!.id));
    expect(images).toHaveLength(DEMO_BATCH_SIZE);

    // Signed Better Auth session cookie that resolves to the demo user.
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("better-auth.session_token=") && /HttpOnly/i.test(c))).toBe(true);
    const cookie = setCookies.map((c) => c.split(";")[0]!).join("; ");
    const auth = await resolveRequestAuth(new NextRequest(`${APP}/api/me`, { headers: { cookie } }), "user");
    expect(auth.user?.id).toBe(u!.id);
    const sessions = await db.select().from(session).where(eq(session.userId, u!.id));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.userAgent).toBe("vitest-demo");

    // A forged cookie (right name, wrong signature) is not a session.
    const token = cookie.match(/better-auth\.session_token=([^.;]+)/)![1]!;
    const forged = await resolveRequestAuth(
      new NextRequest(`${APP}/api/me`, { headers: { cookie: `better-auth.session_token=${token}.AAAA` } }),
      "user",
    );
    expect(forged.user).toBeNull();
  });

  it("never mints a session for a non-demo account, or outside demo mode", async () => {
    const regular = await createTestUser({ email: "real@example.com" });
    await expect(createDemoSessionCookies(regular.id, new Headers())).rejects.toThrow(/not a demo account/);
    expect(await db.select().from(session).where(eq(session.userId, regular.id))).toHaveLength(0);
    setEnv({ DEMO_MODE: "false" });
    await expect(createDemoSessionCookies(regular.id, new Headers())).rejects.toThrow(/DEMO_MODE/);
  });

  it("refuses cross-site requests (no login CSRF)", async () => {
    const res = await demoLogin({ origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(await demoUsers()).toHaveLength(0);
  });

  it("is rate-limited per IP", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("demoLoginsPerHourPerIp", "ip:198.51.100.9");
    const res = await demoLogin({ "x-forwarded-for": "198.51.100.9" });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(await demoUsers()).toHaveLength(0);
  });

  it("doesn't put every visitor in one per-IP bucket when the client IP is unknown (S2-7)", async () => {
    setEnv({ TRUSTED_PROXY_HOPS: "0" });
    for (let i = 0; i < 5; i++) await checkRateLimit("demoLoginsPerHourPerIp", "ip:unknown");
    const res = await demoLogin();
    expect(res.status).toBe(200);
    expect(await demoUsers()).toHaveLength(1);
  });

  it("is rate-limited for the whole deployment", async () => {
    for (let i = 0; i < 120; i++) await checkRateLimit("demoLoginsPerHour", "global");
    const res = await demoLogin({ "x-forwarded-for": "198.51.100.10" });
    expect(res.status).toBe(429);
    expect(await demoUsers()).toHaveLength(0);
  });

  it("still signs in (to /app) when the first batch can't start", async () => {
    packs.hideDemoPack = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await demoLogin();
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ redirect: "/app" });
    expect(res.headers.getSetCookie().length).toBeGreaterThan(0);
    const [u] = await demoUsers();
    expect(u!.credits).toBe(DEMO_CREDITS);
    const ready = await db
      .select()
      .from(identityModels)
      .where(and(eq(identityModels.userId, u!.id), eq(identityModels.status, "ready")));
    expect(ready).toHaveLength(1);
  });

  it("removes the half-created account when seeding the model fails", async () => {
    const { createMockFaceProvider } = await import("@/providers/mock/face");
    const face = createMockFaceProvider();
    setProviderOverrides({ face: { ...face, analyze: async () => ({ faces: [], width: 816, height: 1024 }) } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await demoLogin();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(await demoUsers()).toHaveLength(0);
  });
});
