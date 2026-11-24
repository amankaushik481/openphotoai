import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as deleteApiKey } from "@/app/api/api-keys/[id]/route";
import { GET as listKeys, POST as createKey } from "@/app/api/api-keys/route";
import { GET as getMe, PATCH as patchMe } from "@/app/api/me/route";
import { RATE_LIMITS } from "@/config/rate-limits";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { MAX_ACTIVE_API_KEYS, createApiKey, listApiKeys } from "@/server/auth/api-keys";
import { rateLimit } from "@/server/rate-limit";
import { callRoute, createTestDb, createTestUser, sessionMock } from "../../helpers/factories";

vi.mock("@/server/auth/session", () => sessionMock);

beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
});

describe("GET /api/me", () => {
  it("401 when signed out", async () => {
    const res = await callRoute(getMe, { url: "/api/me" });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("unauthorized");
  });

  it("returns the MeDTO with watermark for unpaid free users", async () => {
    const u = await createTestUser({ credits: 12, name: "Ada" });
    sessionMock.setUser(u);
    const res = await callRoute(getMe, { url: "/api/me" });
    expect(res.status).toBe(200);
    expect(res.json.user).toEqual({
      id: u.id,
      email: u.email,
      name: "Ada",
      image: null,
      role: "user",
      credits: 12,
      plan: "free",
      hasPaid: false,
      watermark: true,
      draftsRemaining: RATE_LIMITS.draftsPerDayFree.limit,
      createdAt: u.createdAt.toISOString(),
      marketingOptIn: false,
    });
    expect(sessionMock.resolveRequestAuth).toHaveBeenCalledWith(expect.anything(), "user");
  });

  it("reports free drafts left today without consuming one (paid users get the bigger allowance)", async () => {
    const free = await createTestUser();
    sessionMock.setUser(free);
    await rateLimit("draftsPerDayFree", `user:${free.id}`);
    await rateLimit("draftsPerDayFree", `user:${free.id}`);
    const left = RATE_LIMITS.draftsPerDayFree.limit - 2;
    expect((await callRoute(getMe, { url: "/api/me" })).json.user.draftsRemaining).toBe(left);
    expect((await callRoute(getMe, { url: "/api/me" })).json.user.draftsRemaining).toBe(left);
    expect(await db.select().from(rateLimits).where(eq(rateLimits.key, `draftsPerDay:user:${free.id}`))).toEqual([]);

    const paid = await createTestUser({ hasPaid: true });
    sessionMock.setUser(paid);
    expect((await callRoute(getMe, { url: "/api/me" })).json.user.draftsRemaining).toBe(RATE_LIMITS.draftsPerDay.limit);
    // Reading never creates counter rows.
    expect(await db.select().from(rateLimits).where(eq(rateLimits.key, `draftsPerDay:user:${paid.id}`))).toEqual([]);
  });

  it("no watermark once the user has paid or is on a paid plan", async () => {
    sessionMock.setUser(await createTestUser({ hasPaid: true }));
    expect((await callRoute(getMe, { url: "/api/me" })).json.user.watermark).toBe(false);
    sessionMock.setUser(await createTestUser({ plan: "pro" }));
    expect((await callRoute(getMe, { url: "/api/me" })).json.user.watermark).toBe(false);
  });

  it("403 suspended for banned users", async () => {
    sessionMock.setUser(await createTestUser({ banned: true }));
    const res = await callRoute(getMe, { url: "/api/me" });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("suspended");
  });
});

describe("PATCH /api/me", () => {
  it("updates name and marketingOptIn", async () => {
    const u = await createTestUser();
    sessionMock.setUser(u);
    const res = await callRoute(patchMe, {
      method: "PATCH",
      url: "/api/me",
      body: { name: "  Grace Hopper ", marketingOptIn: true },
    });
    expect(res.status).toBe(200);
    expect(res.json.user.name).toBe("Grace Hopper");
    expect(res.json.user.marketingOptIn).toBe(true);
  });

  it("rejects app fields and invalid values", async () => {
    sessionMock.setUser(await createTestUser());
    for (const body of [{ credits: 999 }, { role: "admin" }, { plan: "studio" }, { name: "" }, { name: "x".repeat(81) }]) {
      const res = await callRoute(patchMe, { method: "PATCH", url: "/api/me", body });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe("validation_error");
    }
  });
});

describe("/api/api-keys", () => {
  it("POST requires a plan with API access", async () => {
    sessionMock.setUser(await createTestUser({ plan: "starter" }));
    const res = await callRoute(createKey, { url: "/api/api-keys", body: { name: "CI" } });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("plan_limit");
  });

  it("POST returns the key once; GET lists without secrets", async () => {
    const u = await createTestUser({ plan: "pro" });
    sessionMock.setUser(u);
    const created = await callRoute(createKey, { url: "/api/api-keys", body: { name: " CI " } });
    expect(created.status).toBe(200);
    expect(created.json.key).toMatch(/^os_live_/);
    expect(created.json.apiKey).toMatchObject({ name: "CI", prefix: created.json.key.slice(0, 12), lastUsedAt: null });
    expect(created.json.apiKey.keyHash).toBeUndefined();

    const listed = await callRoute(listKeys, { url: "/api/api-keys" });
    expect(listed.json.apiKeys).toHaveLength(1);
    expect(JSON.stringify(listed.json)).not.toContain(created.json.key);
  });

  it("POST creates keys with the chosen scope (default full access) and rejects unknown scopes", async () => {
    sessionMock.setUser(await createTestUser({ plan: "pro" }));
    const full = await callRoute(createKey, { url: "/api/api-keys", body: { name: "default" } });
    expect(full.json.apiKey.scopes).toEqual(["*"]);
    const read = await callRoute(createKey, { url: "/api/api-keys", body: { name: "dashboards", scopes: ["read"] } });
    expect(read.json.apiKey.scopes).toEqual(["read"]);
    const gen = await callRoute(createKey, { url: "/api/api-keys", body: { name: "worker", scopes: ["generate", "read", "generate"] } });
    expect(gen.json.apiKey.scopes).toEqual(["read", "generate"]);
    const star = await callRoute(createKey, { url: "/api/api-keys", body: { name: "all", scopes: ["read", "*"] } });
    expect(star.json.apiKey.scopes).toEqual(["*"]);
    for (const scopes of [["admin"], [], "read"]) {
      expect((await callRoute(createKey, { url: "/api/api-keys", body: { name: "bad", scopes } })).status).toBe(400);
    }
    const listed = await callRoute(listKeys, { url: "/api/api-keys" });
    expect(listed.json.apiKeys.map((k: { scopes: string[] }) => k.scopes)).toContainEqual(["read"]);
  });

  it(`POST refuses more than ${MAX_ACTIVE_API_KEYS} active keys`, async () => {
    const u = await createTestUser({ plan: "studio" });
    for (let i = 0; i < MAX_ACTIVE_API_KEYS; i++) await createApiKey(u.id, `k${i}`);
    sessionMock.setUser(u);
    const res = await callRoute(createKey, { url: "/api/api-keys", body: { name: "one too many" } });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("plan_limit");
  });

  it("POST validates the name", async () => {
    sessionMock.setUser(await createTestUser({ plan: "pro" }));
    const res = await callRoute(createKey, { url: "/api/api-keys", body: { name: "   " } });
    expect(res.status).toBe(400);
  });

  it("DELETE revokes own keys and 404s for someone else's", async () => {
    const owner = await createTestUser({ plan: "pro" });
    const intruder = await createTestUser({ plan: "pro" });
    const { row } = await createApiKey(owner.id, "CI");

    sessionMock.setUser(intruder);
    const denied = await callRoute(deleteApiKey, { method: "DELETE", url: `/api/api-keys/${row.id}`, params: { id: row.id } });
    expect(denied.status).toBe(404);
    expect(await listApiKeys(owner.id)).toHaveLength(1);

    sessionMock.setUser(owner);
    const ok = await callRoute(deleteApiKey, { method: "DELETE", url: `/api/api-keys/${row.id}`, params: { id: row.id } });
    expect(ok.status).toBe(200);
    expect(ok.json).toEqual({ ok: true });
    expect(await listApiKeys(owner.id)).toHaveLength(0);
  });

  it("free users can still list and revoke keys left over from a paid plan", async () => {
    const u = await createTestUser({ plan: "free" });
    const { row } = await createApiKey(u.id, "legacy");
    sessionMock.setUser(u);
    expect((await callRoute(listKeys, { url: "/api/api-keys" })).json.apiKeys).toHaveLength(1);
    const res = await callRoute(deleteApiKey, { method: "DELETE", url: `/api/api-keys/${row.id}`, params: { id: row.id } });
    expect(res.status).toBe(200);
  });
});
