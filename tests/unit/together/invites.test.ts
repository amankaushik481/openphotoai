import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { consentRecords, emailOutbox, identityModels, modelShares } from "@/db/schema";
import type { IdentityModelRow, UserRow } from "@/db/types";
import { DAY_MS, MAX_PENDING_INVITES } from "@/server/together/constants";
import {
  acceptInvite,
  createInvite,
  declineInvite,
  getInvitePreview,
  listInvites,
  revokeShare,
} from "@/server/together/invites";
import { listPartnerModels } from "@/server/together/models";
import { hashInviteToken } from "@/server/together/tokens";
import { createTestDb, createTestModel, createTestUser } from "../../helpers/factories";
import { getShare, insertShare, tokenFromLatestEmail, useTempStorage } from "./helpers";

let cleanupStorage: () => Promise<void>;
beforeAll(async () => {
  cleanupStorage = await useTempStorage();
});
afterAll(async () => {
  await cleanupStorage();
});

let alice: UserRow; // requester
let bob: UserRow; // invitee
let eve: UserRow; // third party
let bobModel: IdentityModelRow;

beforeEach(async () => {
  await createTestDb();
  alice = await createTestUser({ name: "Alice", email: "alice@example.com" });
  bob = await createTestUser({ name: "Bob", email: "bob@example.com" });
  eve = await createTestUser({ name: "Eve", email: "eve@example.com" });
  bobModel = await createTestModel(bob.id, { name: "Bob model", subject: "man" });
});

async function invite(email = "Bob@Example.com", message?: string) {
  const res = await createInvite(alice, { email, message });
  return { ...res, token: await tokenFromLatestEmail(email.toLowerCase()) };
}

describe("createInvite", () => {
  it("stores only the token hash, expires in 14 days and emails the link", async () => {
    const before = Date.now();
    const { invite: dto, token, resent, emailSent } = await invite("Bob@Example.com", "Wedding website photos?");
    expect(resent).toBe(false);
    expect(emailSent).toBe(true);
    expect(dto.inviteeEmail).toBe("bob@example.com");
    expect(dto.status).toBe("pending");

    const row = await getShare(dto.id);
    expect(row.tokenHash).toBe(hashInviteToken(token));
    expect(row.tokenHash).not.toContain(token);
    expect(row.requesterUserId).toBe(alice.id);
    expect(row.message).toBe("Wedding website photos?");
    const ttl = row.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(13.9 * DAY_MS);
    expect(ttl).toBeLessThan(14.1 * DAY_MS);

    const [mail] = await db.select().from(emailOutbox).where(eq(emailOutbox.to, "bob@example.com"));
    expect(mail!.template).toBe("multi_person_invite");
    expect(mail!.text).toContain(`http://localhost:3000/invites/${token}`);
    expect(mail!.text).toContain("Wedding website photos?");
  });

  it("refuses to invite yourself (case-insensitive)", async () => {
    await expect(createInvite(alice, { email: "ALICE@example.com" })).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(await db.select().from(modelShares)).toHaveLength(0);
  });

  it("moderates the message", async () => {
    await expect(
      createInvite(alice, { email: "bob@example.com", message: "let's make a sexy photo" }),
    ).rejects.toMatchObject({
      code: "content_blocked",
    });
    expect(await db.select().from(modelShares)).toHaveLength(0);
    expect(await db.select().from(emailOutbox)).toHaveLength(0);
  });

  it("re-sending rotates the token without creating another invite", async () => {
    const first = await invite();
    const second = await invite("bob@example.com", "Second try");
    expect(second.resent).toBe(true);
    expect(second.invite.id).toBe(first.invite.id);
    expect(second.token).not.toBe(first.token);
    expect(await db.select().from(modelShares)).toHaveLength(1);
    // The old link stops working.
    await expect(acceptInvite(bob, first.token, bobModel.id)).rejects.toMatchObject({ code: "not_found" });
    await acceptInvite(bob, second.token, bobModel.id);
  });

  it(`caps pending invites at ${MAX_PENDING_INVITES}`, async () => {
    for (let i = 0; i < MAX_PENDING_INVITES; i++) {
      await insertShare({ requester: alice, status: "pending", email: `friend${i}@example.com` });
    }
    // Expired or answered invites don't count.
    await insertShare({
      requester: alice,
      status: "pending",
      email: "old@example.com",
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(createInvite(alice, { email: "one-more@example.com" })).rejects.toMatchObject({ code: "conflict" });
    // Re-sending an existing pending invite still works at the cap.
    await expect(createInvite(alice, { email: "friend3@example.com" })).resolves.toMatchObject({ resent: true });
  });

  it("rate-limits invite emails", async () => {
    for (let i = 0; i < 10; i++) await createInvite(alice, { email: `f${i}@example.com` });
    await expect(createInvite(alice, { email: "f10@example.com" })).rejects.toMatchObject({ code: "rate_limited" });
    // Per user: someone else can still invite.
    await expect(createInvite(eve, { email: "bob@example.com" })).resolves.toMatchObject({ resent: false });
  });
});

describe("accept / decline", () => {
  it("accepts with the invitee's own ready model and records consent", async () => {
    const { invite: dto, token } = await invite();
    const before = Date.now();
    await acceptInvite(bob, token, bobModel.id, { ipAddress: "203.0.113.7", userAgent: "Vitest UA" });

    const row = await getShare(dto.id);
    expect(row.status).toBe("accepted");
    expect(row.ownerUserId).toBe(bob.id);
    expect(row.modelId).toBe(bobModel.id);
    expect(row.respondedAt).not.toBeNull();
    // Consent lasts a year after acceptance (not the 14-day invite window).
    expect(row.expiresAt.getTime() - before).toBeGreaterThan(364 * DAY_MS);

    const records = await db.select().from(consentRecords).where(eq(consentRecords.userId, bob.id));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      kind: "multi_person",
      modelId: bobModel.id,
      ipAddress: "203.0.113.7",
      userAgent: "Vitest UA",
    });
    expect(records[0]!.evidence).toMatchObject({ action: "granted", shareId: dto.id, requesterUserId: alice.id });

    const partners = await listPartnerModels(alice.id);
    expect(partners.map((m) => [m.id, m.shared, m.ownerName, m.shareId])).toEqual([[bobModel.id, true, "Bob", dto.id]]);
  });

  it("rejects a signed-in user whose email doesn't match", async () => {
    const { token } = await invite();
    const eveModel = await createTestModel(eve.id);
    await expect(acceptInvite(eve, token, eveModel.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(declineInvite(eve, token)).rejects.toMatchObject({ code: "forbidden" });
    expect(await getInvitePreview(eve, token)).toEqual({ state: "wrong_account", invitedEmail: "bo***@example.com" });
  });

  it("rejects the requester accepting their own invite", async () => {
    const { token } = await invite();
    const aliceModel = await createTestModel(alice.id);
    await expect(acceptInvite(alice, token, aliceModel.id)).rejects.toMatchObject({ code: "forbidden" });
    expect((await getInvitePreview(alice, token)).state).toBe("own_invite");
  });

  it("requires a verified email", async () => {
    const { token } = await invite();
    const unverified = { ...bob, emailVerified: false };
    await expect(acceptInvite(unverified, token, bobModel.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(await getInvitePreview(unverified, token)).toEqual({ state: "unverified" });
    expect((await listInvites(unverified)).received).toEqual([]);
    expect((await listInvites(bob)).received).toHaveLength(1);
  });

  it("requires one of the invitee's OWN ready models", async () => {
    const { token } = await invite();
    const aliceModel = await createTestModel(alice.id);
    await expect(acceptInvite(bob, token, aliceModel.id)).rejects.toMatchObject({ code: "not_found" });
    const collecting = await createTestModel(bob.id, { status: "collecting" });
    await expect(acceptInvite(bob, token, collecting.id)).rejects.toMatchObject({ code: "conflict" });
    const deleted = await createTestModel(bob.id, { deletedAt: new Date() });
    await expect(acceptInvite(bob, token, deleted.id)).rejects.toMatchObject({ code: "not_found" });
    // Nothing was shared by the failed attempts.
    expect((await db.select().from(modelShares))[0]!.status).toBe("pending");
  });

  it("refuses expired invites and marks them expired", async () => {
    const { share, token } = await insertShare({
      requester: alice,
      status: "pending",
      email: bob.email,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(acceptInvite(bob, token, bobModel.id)).rejects.toMatchObject({ code: "conflict" });
    expect((await getShare(share.id)).status).toBe("expired");
    const preview = await getInvitePreview(bob, token);
    expect(preview.state).toBe("closed");
  });

  it("tokens are single-use", async () => {
    const { token } = await invite();
    await acceptInvite(bob, token, bobModel.id);
    await expect(acceptInvite(bob, token, bobModel.id)).rejects.toMatchObject({ code: "conflict" });
    await expect(declineInvite(bob, token)).rejects.toMatchObject({ code: "conflict" });
    expect(await db.select().from(consentRecords)).toHaveLength(1);
  });

  it("declines: nothing is shared and the invite can't be accepted afterwards", async () => {
    const { invite: dto, token } = await invite();
    await declineInvite(bob, token);
    const row = await getShare(dto.id);
    expect(row.status).toBe("declined");
    expect(row.ownerUserId).toBeNull();
    expect(row.modelId).toBeNull();
    await expect(acceptInvite(bob, token, bobModel.id)).rejects.toMatchObject({ code: "conflict" });
    expect(await listPartnerModels(alice.id)).toEqual([]);
  });

  it("lets the signed-in invitee answer by share id, but nobody else", async () => {
    const { invite: dto } = await invite();
    await expect(acceptInvite(eve, dto.id, bobModel.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(acceptInvite(alice, dto.id, bobModel.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await getInvitePreview(eve, dto.id)).toEqual({ state: "not_found" });
    const preview = await getInvitePreview(bob, dto.id);
    expect(preview).toMatchObject({
      state: "pending",
      invite: { from: { name: "Alice", email: "alice@example.com" } },
    });
    await acceptInvite(bob, dto.id, bobModel.id);
    expect((await getShare(dto.id)).status).toBe("accepted");
  });

  it("unknown tokens are not found", async () => {
    await expect(acceptInvite(bob, "nope", bobModel.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await getInvitePreview(bob, "x".repeat(32))).toEqual({ state: "not_found" });
  });
});

describe("revokeShare", () => {
  it("either party can revoke; the share stops authorizing and consent records the revocation", async () => {
    const { share } = await insertShare({ requester: alice, owner: bob, model: bobModel });
    await revokeShare(bob, share.id, { ipAddress: "198.51.100.1" });
    expect((await getShare(share.id)).status).toBe("revoked");
    expect(await listPartnerModels(alice.id)).toEqual([]);
    const [record] = await db
      .select()
      .from(consentRecords)
      .where(and(eq(consentRecords.userId, bob.id), eq(consentRecords.kind, "multi_person")));
    expect(record!.evidence).toMatchObject({ action: "revoked", revokedBy: "owner", shareId: share.id });

    const other = await insertShare({ requester: alice, owner: bob, model: bobModel });
    await revokeShare(alice, other.share.id);
    expect((await getShare(other.share.id)).status).toBe("revoked");
    // Idempotent.
    await expect(revokeShare(alice, other.share.id)).resolves.toMatchObject({ status: "revoked" });
  });

  it("the requester can withdraw a pending invite", async () => {
    const { invite: dto, token } = await invite();
    await revokeShare(alice, dto.id);
    await expect(acceptInvite(bob, token, bobModel.id)).rejects.toMatchObject({ code: "conflict" });
  });

  it("third parties (and the invitee before accepting) can't revoke", async () => {
    const { share } = await insertShare({ requester: alice, owner: bob, model: bobModel });
    await expect(revokeShare(eve, share.id)).rejects.toMatchObject({ code: "not_found" });
    const pending = await insertShare({ requester: alice, status: "pending", email: bob.email });
    await expect(revokeShare(bob, pending.share.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await getShare(share.id)).status).toBe("accepted");
  });
});

describe("listInvites", () => {
  it("lists sent and received invites with effective statuses", async () => {
    const accepted = await insertShare({ requester: alice, owner: bob, model: bobModel });
    const pending = await insertShare({ requester: eve, status: "pending", email: "BOB@example.com".toLowerCase() });
    await insertShare({
      requester: alice,
      status: "pending",
      email: "late@example.com",
      expiresAt: new Date(Date.now() - 1),
    });

    const forAlice = await listInvites(alice);
    expect(forAlice.received).toEqual([]);
    expect(forAlice.sent.map((s) => s.status).sort()).toEqual(["accepted", "expired"]);
    const sentAccepted = forAlice.sent.find((s) => s.id === accepted.share.id)!;
    expect(sentAccepted.partner).toEqual({ name: "Bob", modelId: bobModel.id, modelName: "Bob model" });

    const forBob = await listInvites(bob);
    expect(forBob.sent).toEqual([]);
    expect(forBob.received.map((r) => [r.id, r.status, r.from.email])).toEqual(
      expect.arrayContaining([
        [accepted.share.id, "accepted", "alice@example.com"],
        [pending.share.id, "pending", "eve@example.com"],
      ]),
    );
    expect(forBob.received.find((r) => r.id === accepted.share.id)!.model).toEqual({
      id: bobModel.id,
      name: "Bob model",
    });

    const forEve = await listInvites(eve);
    expect(forEve.received).toEqual([]);
    expect(forEve.sent.map((s) => s.id)).toEqual([pending.share.id]);
  });

  it("hides a deleted model's name from the requester", async () => {
    const { share } = await insertShare({ requester: alice, owner: bob, model: bobModel });
    await db
      .update(identityModels)
      .set({ deletedAt: new Date(), status: "deleting" })
      .where(eq(identityModels.id, bobModel.id));
    const { sent } = await listInvites(alice);
    expect(sent.find((s) => s.id === share.id)!.partner).toEqual({ name: "Bob", modelId: null, modelName: null });
    expect(await listPartnerModels(alice.id)).toEqual([]);
  });
});
