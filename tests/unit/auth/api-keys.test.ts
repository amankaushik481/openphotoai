import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import {
  API_KEY_PREFIX,
  MAX_ACTIVE_API_KEYS,
  assertCanCreateApiKey,
  createApiKey,
  hashApiKey,
  listApiKeys,
  revokeApiKey,
  toApiKeyDTO,
} from "@/server/auth/api-keys";
import { authenticateApiKey, resolveRequestAuth } from "@/server/auth/session";
import { AppError } from "@/server/http";
import { createTestDb, createTestUser } from "../../helpers/db";

function bearer(key: string, url = "http://localhost:3000/api/v1/models"): NextRequest {
  return new NextRequest(url, { headers: { authorization: `Bearer ${key}` } });
}

beforeEach(async () => {
  await createTestDb();
});

describe("api key storage", () => {
  it("creates os_live_ keys and stores only the sha256 + display prefix", async () => {
    const u = await createTestUser({ plan: "pro" });
    const { key, row } = await createApiKey(u.id, "CI");
    expect(key).toMatch(/^os_live_[A-Za-z0-9]{32}$/);
    expect(row.prefix).toBe(key.slice(0, 12));
    expect(row.keyHash).toBe(hashApiKey(key));
    expect(row.keyHash).not.toContain(key);
    expect(row.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(toApiKeyDTO(row))).not.toContain(row.keyHash);
  });

  it("hashes deterministically", () => {
    expect(hashApiKey("os_live_abc")).toBe(hashApiKey("os_live_abc"));
    expect(hashApiKey("os_live_abc")).not.toBe(hashApiKey("os_live_abd"));
  });

  it("lists only the owner's active keys and revokes only their own", async () => {
    const a = await createTestUser({ plan: "pro" });
    const b = await createTestUser({ plan: "pro" });
    const { row: k1 } = await createApiKey(a.id, "one");
    await createApiKey(a.id, "two");
    const { row: other } = await createApiKey(b.id, "theirs");

    expect((await listApiKeys(a.id)).map((k) => k.name).sort()).toEqual(["one", "two"]);
    expect(await revokeApiKey(a.id, other.id)).toBeNull();
    expect((await revokeApiKey(a.id, k1.id))?.revokedAt).toBeInstanceOf(Date);
    expect(await revokeApiKey(a.id, k1.id)).toBeNull(); // already revoked
    expect((await listApiKeys(a.id)).map((k) => k.name)).toEqual(["two"]);
    expect(await listApiKeys(b.id)).toHaveLength(1);
  });
});

describe("assertCanCreateApiKey", () => {
  it("requires a plan with API access", async () => {
    for (const plan of ["free", "starter"] as const) {
      const u = await createTestUser({ plan });
      await expect(assertCanCreateApiKey(u)).rejects.toMatchObject({ code: "plan_limit" });
    }
    for (const plan of ["pro", "studio"] as const) {
      const u = await createTestUser({ plan });
      await expect(assertCanCreateApiKey(u)).resolves.toBeUndefined();
    }
  });

  it(`caps active keys at ${MAX_ACTIVE_API_KEYS}`, async () => {
    const u = await createTestUser({ plan: "pro" });
    const rows = [];
    for (let i = 0; i < MAX_ACTIVE_API_KEYS; i++) rows.push((await createApiKey(u.id, `k${i}`)).row);
    await expect(assertCanCreateApiKey(u)).rejects.toMatchObject({ code: "plan_limit" });
    await revokeApiKey(u.id, rows[0]!.id);
    await expect(assertCanCreateApiKey(u)).resolves.toBeUndefined();
  });
});

describe("authenticateApiKey", () => {
  it("authenticates a valid key and returns the fresh user row", async () => {
    const u = await createTestUser({ plan: "pro", credits: 42 });
    const { key, row } = await createApiKey(u.id, "CI");
    const result = await authenticateApiKey(bearer(key));
    expect(result?.user.id).toBe(u.id);
    expect(result?.user.credits).toBe(42);
    expect(result?.apiKey.id).toBe(row.id);
  });

  it("returns null for missing, malformed, unknown and revoked keys", async () => {
    const u = await createTestUser({ plan: "pro" });
    const { key, row } = await createApiKey(u.id, "CI");
    expect(await authenticateApiKey(new NextRequest("http://localhost:3000/api/v1/models"))).toBeNull();
    expect(await authenticateApiKey(bearer("not-a-key"))).toBeNull();
    expect(await authenticateApiKey(bearer(`${API_KEY_PREFIX}${"x".repeat(32)}`))).toBeNull();
    await revokeApiKey(u.id, row.id);
    expect(await authenticateApiKey(bearer(key))).toBeNull();
  });

  it("throws plan_limit when the owner's plan lost API access", async () => {
    const u = await createTestUser({ plan: "free" });
    const { key } = await createApiKey(u.id, "old");
    await expect(authenticateApiKey(bearer(key))).rejects.toMatchObject({ code: "plan_limit", status: 403 });
  });

  it("returns null for keys of deleted users", async () => {
    const u = await createTestUser({ plan: "pro", deletedAt: new Date() });
    const { key } = await createApiKey(u.id, "CI");
    expect(await authenticateApiKey(bearer(key))).toBeNull();
  });

  it("updates lastUsedAt at most once a minute", async () => {
    const u = await createTestUser({ plan: "pro" });
    const { key, row } = await createApiKey(u.id, "CI");
    const first = await authenticateApiKey(bearer(key));
    const stamped = first!.apiKey.lastUsedAt!;
    expect(stamped).toBeInstanceOf(Date);

    await authenticateApiKey(bearer(key));
    const [afterSecond] = await db.select().from(apiKeys).where(eq(apiKeys.id, row.id));
    expect(afterSecond!.lastUsedAt!.getTime()).toBe(stamped.getTime());

    const old = new Date(Date.now() - 5 * 60_000);
    await db.update(apiKeys).set({ lastUsedAt: old }).where(eq(apiKeys.id, row.id));
    await authenticateApiKey(bearer(key));
    const [afterStale] = await db.select().from(apiKeys).where(eq(apiKeys.id, row.id));
    expect(afterStale!.lastUsedAt!.getTime()).toBeGreaterThan(old.getTime());
  });
});

describe("resolveRequestAuth (API modes)", () => {
  it("api mode: resolves the key's user", async () => {
    const u = await createTestUser({ plan: "studio" });
    const { key, row } = await createApiKey(u.id, "CI");
    const result = await resolveRequestAuth(bearer(key), "api");
    expect(result.user?.id).toBe(u.id);
    expect(result.apiKey?.id).toBe(row.id);
  });

  it("api mode: rejects missing and invalid keys with 401", async () => {
    const missing = resolveRequestAuth(new NextRequest("http://localhost:3000/api/v1/models"), "api");
    await expect(missing).rejects.toBeInstanceOf(AppError);
    await expect(missing).rejects.toMatchObject({ code: "unauthorized" });
    await expect(resolveRequestAuth(bearer("os_live_nope"), "api")).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("user_or_api mode: uses the API key when one is presented", async () => {
    const u = await createTestUser({ plan: "pro" });
    const { key } = await createApiKey(u.id, "CI");
    const result = await resolveRequestAuth(bearer(key, "http://localhost:3000/api/models"), "user_or_api");
    expect(result.user?.id).toBe(u.id);
    expect(result.apiKey).not.toBeNull();
  });

  it("user_or_api mode: no key and no session → anonymous (route() answers 401)", async () => {
    const result = await resolveRequestAuth(new NextRequest("http://localhost:3000/api/models"), "user_or_api");
    expect(result).toEqual({ user: null, apiKey: null });
  });

  it("returns banned users so route() can answer `suspended`", async () => {
    const u = await createTestUser({ plan: "pro", banned: true });
    const { key } = await createApiKey(u.id, "CI");
    const result = await resolveRequestAuth(bearer(key), "api");
    expect(result.user?.banned).toBe(true);
  });
});
