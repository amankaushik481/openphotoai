import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { consentRecords } from "@/db/schema";
import type { IdentityModelRow, UserRow } from "@/db/types";
import { POST as acceptRoute } from "@/app/api/multi-person/invites/[token]/accept/route";
import { POST as declineRoute } from "@/app/api/multi-person/invites/[token]/decline/route";
import { GET as listRoute, POST as inviteRoute } from "@/app/api/multi-person/invites/route";
import { DELETE as revokeRoute } from "@/app/api/multi-person/shares/[id]/route";
import { callRoute, createTestDb, createTestModel, createTestUser, sessionMock } from "../../helpers/factories";
import { getShare, insertShare, tokenFromLatestEmail, useTempStorage } from "./helpers";

vi.mock("@/server/auth/session", () => sessionMock);

let cleanupStorage: () => Promise<void>;
beforeAll(async () => {
  cleanupStorage = await useTempStorage();
});
afterAll(async () => {
  await cleanupStorage();
});

let alice: UserRow;
let bob: UserRow;
let eve: UserRow;
let bobModel: IdentityModelRow;

beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
  alice = await createTestUser({ name: "Alice", email: "alice@example.com" });
  bob = await createTestUser({ name: "Bob", email: "bob@example.com" });
  eve = await createTestUser({ name: "Eve", email: "eve@example.com" });
  bobModel = await createTestModel(bob.id, { name: "Bob model" });
});

describe("POST /api/multi-person/invites", () => {
  it("requires a session", async () => {
    const res = await callRoute(inviteRoute, { body: { email: "bob@example.com" } });
    expect(res.status).toBe(401);
  });

  it("validates the body", async () => {
    sessionMock.setUser(alice);
    expect((await callRoute(inviteRoute, { body: { email: "not-an-email" } })).status).toBe(400);
    expect((await callRoute(inviteRoute, { body: { email: "bob@example.com", message: "x".repeat(501) } })).status).toBe(400);
    expect((await callRoute(inviteRoute, { body: { email: "alice@example.com" } })).status).toBe(400);
  });

  it("creates an invite and lists it for both sides", async () => {
    sessionMock.setUser(alice);
    const res = await callRoute(inviteRoute, { body: { email: " Bob@Example.com ", message: "Photos together?" } });
    expect(res.status).toBe(200);
    expect(res.json.invite).toMatchObject({ inviteeEmail: "bob@example.com", status: "pending", message: "Photos together?" });
    expect(res.json.resent).toBe(false);
    expect(JSON.stringify(res.json)).not.toMatch(/token/i);

    const sent = await callRoute(listRoute);
    expect(sent.json.sent).toHaveLength(1);
    expect(sent.json.received).toEqual([]);

    sessionMock.setUser(bob);
    const received = await callRoute(listRoute);
    expect(received.json.received).toHaveLength(1);
    expect(received.json.received[0].from).toEqual({ name: "Alice", email: "alice@example.com" });

    sessionMock.setUser(eve);
    const none = await callRoute(listRoute);
    expect(none.json).toEqual({ sent: [], received: [] });
  });
});

describe("accept / decline routes", () => {
  async function inviteBob(): Promise<string> {
    sessionMock.setUser(alice);
    await callRoute(inviteRoute, { body: { email: "bob@example.com" } });
    return tokenFromLatestEmail("bob@example.com");
  }

  it("accepts with the invitee's model and records IP + user agent", async () => {
    const token = await inviteBob();
    sessionMock.setUser(bob);
    const res = await callRoute(acceptRoute, {
      params: { token },
      body: { modelId: bobModel.id },
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "Mozilla/5.0 test" },
    });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
    const [record] = await db.select().from(consentRecords).where(eq(consentRecords.userId, bob.id));
    expect(record).toMatchObject({ kind: "multi_person", ipAddress: "203.0.113.9", userAgent: "Mozilla/5.0 test" });
  });

  it("maps failures to HTTP errors (email mismatch, foreign model, reuse)", async () => {
    const token = await inviteBob();
    const eveModel = await createTestModel(eve.id);

    sessionMock.setUser(eve);
    expect((await callRoute(acceptRoute, { params: { token }, body: { modelId: eveModel.id } })).status).toBe(403);

    sessionMock.setUser(bob);
    expect((await callRoute(acceptRoute, { params: { token }, body: { modelId: eveModel.id } })).status).toBe(404);
    expect((await callRoute(acceptRoute, { params: { token }, body: {} })).status).toBe(400);
    expect((await callRoute(acceptRoute, { params: { token }, body: { modelId: bobModel.id } })).status).toBe(200);
    expect((await callRoute(acceptRoute, { params: { token }, body: { modelId: bobModel.id } })).status).toBe(409);
  });

  it("declines", async () => {
    const token = await inviteBob();
    sessionMock.setUser(bob);
    expect((await callRoute(declineRoute, { method: "POST", params: { token } })).status).toBe(200);
    expect((await callRoute(declineRoute, { method: "POST", params: { token } })).status).toBe(409);
  });
});

describe("DELETE /api/multi-person/shares/:id", () => {
  it("lets either party revoke and hides the share from everyone else", async () => {
    const { share } = await insertShare({ requester: alice, owner: bob, model: bobModel });

    sessionMock.setUser(eve);
    expect((await callRoute(revokeRoute, { method: "DELETE", params: { id: share.id } })).status).toBe(404);
    expect((await getShare(share.id)).status).toBe("accepted");

    sessionMock.setUser(bob);
    expect((await callRoute(revokeRoute, { method: "DELETE", params: { id: share.id } })).status).toBe(200);
    expect((await getShare(share.id)).status).toBe("revoked");

    sessionMock.setUser(null);
    expect((await callRoute(revokeRoute, { method: "DELETE", params: { id: share.id } })).status).toBe(401);
  });
});
