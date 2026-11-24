import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as confirmRoute } from "@/app/api/account/delete/confirm/route";
import { POST as deleteRoute } from "@/app/api/account/delete/route";
import { RATE_LIMITS } from "@/config/rate-limits";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { callRoute, createTestDb, createTestUser, sessionMock } from "../../helpers/factories";
import { createPaymentProviderMock, useTempStorage } from "./fixtures";

const state = vi.hoisted(() => ({ payment: null as unknown }));
vi.mock("@/providers/registry", async () => (await import("./fixtures")).registryMock(state));
vi.mock("@/server/auth/session", async () => (await import("../../helpers/session")).sessionMock);
vi.mock("@/server/models/service", () => ({
  deleteModelCompletely: vi.fn(async () => ({ providerDeleted: true, storageObjectsDeleted: 0 })),
}));
vi.mock("@/server/jobs/engine", () => ({ cancelJob: vi.fn() }));

let cleanup: () => Promise<void>;

beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
  ({ cleanup } = await useTempStorage());
  state.payment = createPaymentProviderMock();
});

afterEach(async () => {
  await cleanup();
});

async function emailedToken(): Promise<string> {
  const rows = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.template, "deletion_confirm_request"));
  return /token=([A-Za-z0-9]+)/.exec(rows.at(-1)!.text!)![1]!;
}

describe("POST /api/account/delete", () => {
  it("401 when signed out", async () => {
    const res = await callRoute(deleteRoute, { method: "POST", url: "/api/account/delete" });
    expect(res.status).toBe(401);
  });

  it("emails a confirmation link and deletes nothing yet", async () => {
    const user = await createTestUser({ email: "ada@example.com" });
    sessionMock.setUser(user);
    const res = await callRoute(deleteRoute, { method: "POST", url: "/api/account/delete" });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, expiresInHours: 24, expiresAt: expect.any(String) });
    expect(await emailedToken()).toHaveLength(32);
    const [still] = await db.select().from(schema.user).where(eq(schema.user.id, user.id));
    expect(still!.deletedAt).toBeNull();
  });

  it("429 after three requests in a day", async () => {
    sessionMock.setUser(await createTestUser());
    for (let i = 0; i < 3; i++) {
      expect((await callRoute(deleteRoute, { method: "POST", url: "/api/account/delete" })).status).toBe(200);
    }
    const res = await callRoute(deleteRoute, { method: "POST", url: "/api/account/delete" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("POST /api/account/delete/confirm", () => {
  const confirm = (body: unknown, ip = "203.0.113.7") =>
    callRoute(confirmRoute, { url: "/api/account/delete/confirm", body, headers: { "x-forwarded-for": ip } });

  it("validates the body", async () => {
    expect((await confirm({})).status).toBe(400);
    expect((await confirm({ token: "" })).status).toBe(400);
  });

  it("404 with reason for an unknown token", async () => {
    const res = await confirm({ token: "not-a-real-token" });
    expect(res.status).toBe(404);
    expect(res.json.error.details).toEqual({ reason: "invalid" });
  });

  it("works without a session and deletes the account", async () => {
    const user = await createTestUser({ email: "ada@example.com" });
    sessionMock.setUser(user);
    await callRoute(deleteRoute, { method: "POST", url: "/api/account/delete" });
    const token = await emailedToken();
    sessionMock.setUser(null); // link opened on another device

    const res = await confirm({ token });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true, status: "completed" });
    expect(await db.select().from(schema.user).where(eq(schema.user.id, user.id))).toEqual([]);
  });

  it("is rate limited per IP, in its own bucket", async () => {
    const { limit } = RATE_LIMITS.reportsPerHourPerIp;
    for (let i = 0; i < limit; i++) expect((await confirm({ token: `t${i}` })).status).toBe(404);
    expect((await confirm({ token: "t" })).status).toBe(429);
    expect((await confirm({ token: "t" }, "198.51.100.1")).status).toBe(404);
    const keys = (await db.select().from(schema.rateLimits)).map((r) => r.key);
    expect(keys).toContain("reportsPerHourPerIp:account-delete-confirm:203.0.113.7");
  });
});
