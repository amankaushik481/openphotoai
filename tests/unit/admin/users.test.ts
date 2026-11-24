import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { moderationEvents, session, shareLinks, user } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { adminAdjust } from "@/server/credits/ledger";
import { getUserDetail, searchUsers, suspendUser, unsuspendUser } from "@/server/admin";
import { createTestDb, createTestJob, createTestMedia, createTestModel, createTestUser } from "../../helpers/factories";
import { createModerationEvent, createPayment, createReport, createSession, createShareLink, createSubscription } from "./fixtures";

const email = vi.hoisted(() => ({ sendEmailSafe: vi.fn(async () => ({ id: "eml_1", status: "mocked" as const })) }));
vi.mock("@/server/email", () => email);

let admin: UserRow;
let target: UserRow;

beforeEach(async () => {
  await createTestDb();
  email.sendEmailSafe.mockClear();
  admin = await createTestUser({ role: "admin", email: "boss@example.com" });
  target = await createTestUser({ email: "jane@example.com", name: "Jane Roe" });
});

describe("suspendUser", () => {
  it("bans the user, deletes sessions, revokes share links, records an event and emails them", async () => {
    await createSession(target.id);
    await createSession(target.id);
    const otherSession = await createSession(admin.id);
    const live = await createShareLink(target.id);
    const alreadyRevoked = await createShareLink(target.id, { revokedAt: new Date("2026-01-01") });
    const othersLink = await createShareLink(admin.id);

    const result = await suspendUser(admin.id, target.id, "  Uploaded photos of someone else  ");
    expect(result).toMatchObject({ suspended: true, sessionsDeleted: 2, shareLinksRevoked: 1 });

    const [row] = await db.select().from(user).where(eq(user.id, target.id));
    expect(row).toMatchObject({ banned: true, banReason: "Uploaded photos of someone else" });

    expect(await db.select().from(session).where(eq(session.userId, target.id))).toHaveLength(0);
    expect(await db.select().from(session).where(eq(session.id, otherSession.id))).toHaveLength(1);

    const links = Object.fromEntries((await db.select().from(shareLinks)).map((l) => [l.id, l.revokedAt]));
    expect(links[live.id]).toBeInstanceOf(Date);
    expect(links[alreadyRevoked.id]).toEqual(new Date("2026-01-01"));
    expect(links[othersLink.id]).toBeNull();

    const events = await db
      .select()
      .from(moderationEvents)
      .where(and(eq(moderationEvents.userId, target.id), eq(moderationEvents.kind, "account_suspended")));
    expect(events).toHaveLength(1);
    expect(events[0]!.details).toMatchObject({ reason: "Uploaded photos of someone else", adminId: admin.id, sessionsDeleted: 2 });

    expect(email.sendEmailSafe).toHaveBeenCalledWith(
      "account_suspended",
      "jane@example.com",
      { reason: "Uploaded photos of someone else" },
      { userId: target.id },
    );
  });

  it("refuses to suspend yourself or another admin", async () => {
    const otherAdmin = await createTestUser({ role: "admin" });
    await expect(suspendUser(admin.id, admin.id, "nope")).rejects.toMatchObject({ code: "forbidden" });
    await expect(suspendUser(admin.id, otherAdmin.id, "nope")).rejects.toMatchObject({ code: "forbidden" });
    const rows = await db.select().from(user).where(eq(user.banned, true));
    expect(rows).toHaveLength(0);
    expect(email.sendEmailSafe).not.toHaveBeenCalled();
  });

  it("requires a reason and an existing user", async () => {
    await expect(suspendUser(admin.id, target.id, "   ")).rejects.toMatchObject({ code: "validation_error" });
    await expect(suspendUser(admin.id, "usr_missing", "spam")).rejects.toMatchObject({ code: "not_found" });
  });

  it("is idempotent: a second suspension sends no email and records no new event", async () => {
    await suspendUser(admin.id, target.id, "spam");
    await createSession(target.id); // e.g. a session created in a race
    const again = await suspendUser(admin.id, target.id, "spam again");
    expect(again).toMatchObject({ suspended: false, sessionsDeleted: 1 });
    expect(again.user.banReason).toBe("spam");
    expect(email.sendEmailSafe).toHaveBeenCalledTimes(1);
    const events = await db.select().from(moderationEvents).where(eq(moderationEvents.kind, "account_suspended"));
    expect(events).toHaveLength(1);
  });

  it("unsuspendUser lifts the ban", async () => {
    await suspendUser(admin.id, target.id, "spam");
    const result = await unsuspendUser(admin.id, target.id);
    expect(result.unsuspended).toBe(true);
    expect(result.user).toMatchObject({ banned: false, banReason: null });
    expect((await unsuspendUser(admin.id, target.id)).unsuspended).toBe(false);
  });
});

describe("searchUsers", () => {
  it("matches email/name case-insensitively, treats wildcards literally and paginates newest first", async () => {
    await createTestUser({ email: "jane.doe@corp.com", name: "Jane Doe" });
    await createTestUser({ email: "j_100%@x.com", name: "Weird" });
    const byName = await searchUsers("JANE");
    expect(byName.users.map((u) => u.email).sort()).toEqual(["jane.doe@corp.com", "jane@example.com"]);
    expect((await searchUsers("%")).users.map((u) => u.email)).toEqual(["j_100%@x.com"]);
    expect((await searchUsers(target.id)).users.map((u) => u.id)).toEqual([target.id]);

    const first = await searchUsers(null, null, { limit: 2 });
    expect(first.users).toHaveLength(2);
    expect(first.nextCursor).toBe(first.users[1]!.id);
    const second = await searchUsers(null, first.nextCursor, { limit: 2 });
    expect(second.users).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    const all = [...first.users, ...second.users].map((u) => u.id);
    expect(new Set(all).size).toBe(4);
  });
});

describe("getUserDetail", () => {
  it("collects profile, ledger, jobs, models, media, billing and moderation history", async () => {
    await adminAdjust(admin.id, target.id, 25, "Goodwill");
    const model = await createTestModel(target.id);
    await createTestJob(target.id, { modelId: model.id, status: "failed", error: "provider down" });
    await createTestMedia(target.id);
    await createTestMedia(target.id, { removedAt: new Date() });
    await createSubscription(target.id);
    await createPayment(target.id);
    await createModerationEvent({ userId: target.id });
    await createReport({ targetUserId: target.id });
    await createTestJob(admin.id); // someone else's job is not included

    const detail = await getUserDetail(target.id);
    expect(detail.user).toMatchObject({ id: target.id, email: "jane@example.com", banned: false });
    expect(detail.balance).toBe(25);
    expect(detail.ledger).toHaveLength(1);
    expect(detail.ledger[0]).toMatchObject({ delta: 25, reason: "admin_adjust", note: "Goodwill", createdBy: admin.id });
    expect(detail.jobs).toHaveLength(1);
    expect(detail.jobs[0]).toMatchObject({ status: "failed", error: "provider down", userEmail: "jane@example.com" });
    expect(detail.models).toEqual([expect.objectContaining({ id: model.id, mode: "trained", status: "ready" })]);
    expect(detail.media).toEqual({ total: 2, removed: 1 });
    expect(detail.subscriptions).toHaveLength(1);
    expect(detail.payments).toHaveLength(1);
    expect(detail.moderationEvents).toHaveLength(1);
    expect(detail.reports).toHaveLength(1);

    await expect(getUserDetail("usr_missing")).rejects.toMatchObject({ code: "not_found" });
  });
});
