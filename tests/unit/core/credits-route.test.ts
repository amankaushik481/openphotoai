import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/credits/route";
import { debitForJob, grantCredits } from "@/server/credits/ledger";
import { createTestDb, createTestUser } from "../../helpers/db";
import { callRoute, sessionMock } from "../../helpers/factories";

vi.mock("@/server/auth/session", () => sessionMock);

beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
});

describe("GET /api/credits", () => {
  it("requires authentication", async () => {
    const res = await callRoute(GET, { url: "/api/credits" });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("unauthorized");
    expect(sessionMock.resolveRequestAuth).toHaveBeenCalledWith(expect.anything(), "user_or_api");
  });

  it("returns the balance and the user's ledger, newest first, with a cursor", async () => {
    const u = await createTestUser();
    const other = await createTestUser();
    await grantCredits(other.id, 50, "purchase", "other");
    await grantCredits(u.id, 10, "purchase", "p1");
    await debitForJob({ userId: u.id, jobId: "job_1", amount: 4 });
    await grantCredits(u.id, 2, "job_refund", "r1");
    sessionMock.setUser(u);

    const first = await callRoute(GET, { url: "/api/credits?limit=2" });
    expect(first.status).toBe(200);
    expect(first.json.balance).toBe(8);
    expect(first.json.ledger.map((e: { delta: number }) => e.delta)).toEqual([2, -4]);
    expect(first.json.ledger[1]).toMatchObject({ reason: "job_debit", jobId: "job_1", balanceAfter: 6 });
    expect(first.json.nextCursor).toEqual(expect.any(String));

    const second = await callRoute(GET, { url: `/api/credits?limit=2&cursor=${first.json.nextCursor}` });
    expect(second.json.ledger.map((e: { delta: number }) => e.delta)).toEqual([10]);
    expect(second.json.nextCursor).toBeNull();
  });

  it("works with API-key auth", async () => {
    const u = await createTestUser({ credits: 0 });
    sessionMock.setUser(u, {
      apiKey: { id: "key_1", userId: u.id, name: "ci", prefix: "os_live_ab", keyHash: "h", scopes: ["*"], lastUsedAt: null, revokedAt: null, createdAt: new Date() },
    });
    const res = await callRoute(GET, { url: "/api/credits" });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ balance: 0, ledger: [], nextCursor: null });
  });

  it("validates query parameters", async () => {
    sessionMock.setUser(await createTestUser());
    const res = await callRoute(GET, { url: "/api/credits?limit=500" });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("validation_error");
  });

  it("rejects suspended users", async () => {
    sessionMock.setUser(await createTestUser({ banned: true }));
    const res = await callRoute(GET, { url: "/api/credits" });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("suspended");
  });
});
