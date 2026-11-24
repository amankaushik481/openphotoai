import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listJobsRoute } from "@/app/api/admin/jobs/route";
import { POST as refundRoute } from "@/app/api/admin/jobs/[id]/refund/route";
import { POST as reviewEventRoute } from "@/app/api/admin/moderation-events/[id]/review/route";
import { GET as moderationRoute } from "@/app/api/admin/moderation/route";
import { POST as resolveRoute } from "@/app/api/admin/reports/[id]/resolve/route";
import { GET as statsRoute } from "@/app/api/admin/stats/route";
import { POST as creditsRoute } from "@/app/api/admin/users/[id]/credits/route";
import { GET as userDetailRoute } from "@/app/api/admin/users/[id]/route";
import { POST as suspendRoute } from "@/app/api/admin/users/[id]/suspend/route";
import { POST as unsuspendRoute } from "@/app/api/admin/users/[id]/unsuspend/route";
import { GET as usersRoute } from "@/app/api/admin/users/route";
import { db } from "@/db";
import { creditLedger, user } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { debitForJob } from "@/server/credits/ledger";
import { callRoute, createTestDb, createTestJob, createTestUser, sessionMock } from "../../helpers/factories";
import { createModerationEvent, createReport } from "./fixtures";

vi.mock("@/server/auth/session", () => sessionMock);
vi.mock("@/server/email", () => ({ sendEmailSafe: vi.fn(async () => null) }));

let admin: UserRow;
let member: UserRow;

beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
  admin = await createTestUser({ role: "admin" });
  member = await createTestUser({ credits: 10, email: "member@example.com" });
});

type Handler = Parameters<typeof callRoute>[0];
const p = (id: string) => ({ id });

const endpoints: { name: string; handler: Handler; opts: () => Parameters<typeof callRoute>[1] }[] = [
  { name: "GET stats", handler: statsRoute, opts: () => ({ url: "/api/admin/stats" }) },
  { name: "GET users", handler: usersRoute, opts: () => ({ url: "/api/admin/users?q=a" }) },
  { name: "GET user", handler: userDetailRoute as Handler, opts: () => ({ url: "/", params: p(member.id) }) },
  { name: "POST credits", handler: creditsRoute as Handler, opts: () => ({ body: { delta: 5, note: "x" }, params: p(member.id) }) },
  { name: "POST suspend", handler: suspendRoute as Handler, opts: () => ({ body: { reason: "spam" }, params: p(member.id) }) },
  { name: "POST unsuspend", handler: unsuspendRoute as Handler, opts: () => ({ method: "POST", params: p(member.id) }) },
  { name: "GET jobs", handler: listJobsRoute, opts: () => ({ url: "/api/admin/jobs" }) },
  { name: "POST refund", handler: refundRoute as Handler, opts: () => ({ method: "POST", params: p("job_x") }) },
  { name: "GET moderation", handler: moderationRoute, opts: () => ({ url: "/api/admin/moderation" }) },
  { name: "POST resolve", handler: resolveRoute as Handler, opts: () => ({ body: { action: "dismiss" }, params: p("rpt_x") }) },
  { name: "POST review", handler: reviewEventRoute as Handler, opts: () => ({ method: "POST", params: p("mev_x") }) },
];

describe("admin routes: access control", () => {
  it.each(endpoints)("$name answers 401 when signed out", async ({ handler, opts }) => {
    const res = await callRoute(handler, opts());
    expect(res.status).toBe(401);
  });

  it.each(endpoints)("$name answers 403 for non-admins (and changes nothing)", async ({ handler, opts }) => {
    sessionMock.setUser(member);
    const res = await callRoute(handler, opts());
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("forbidden");
    expect(sessionMock.resolveRequestAuth).toHaveBeenCalledWith(expect.anything(), "admin");
    const [row] = await db.select().from(user).where(eq(user.id, member.id));
    expect(row).toMatchObject({ credits: 10, banned: false });
  });

  it("rejects a suspended admin", async () => {
    sessionMock.setUser({ ...admin, banned: true });
    const res = await callRoute(statsRoute, { url: "/api/admin/stats" });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("suspended");
  });
});

describe("admin routes: actions", () => {
  beforeEach(() => sessionMock.setUser(admin));

  it("POST /users/:id/credits writes an admin_adjust ledger entry with the admin and note", async () => {
    const res = await callRoute(creditsRoute as Handler, {
      body: { delta: 15, note: "Support goodwill" },
      params: p(member.id),
      headers: { "Idempotency-Key": "adj-1" },
    });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ balance: 25, applied: true });

    const entries = await db.select().from(creditLedger).where(eq(creditLedger.userId, member.id));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ delta: 15, reason: "admin_adjust", note: "Support goodwill", createdBy: admin.id, balanceAfter: 25 });

    // Retrying with the same Idempotency-Key does not double-apply.
    const retry = await callRoute(creditsRoute as Handler, {
      body: { delta: 15, note: "Support goodwill" },
      params: p(member.id),
      headers: { "Idempotency-Key": "adj-1" },
    });
    expect(retry.json).toEqual({ balance: 25, applied: false });
  });

  it("POST /users/:id/credits validates the body and never overdraws", async () => {
    const zero = await callRoute(creditsRoute as Handler, { body: { delta: 0, note: "x" }, params: p(member.id) });
    expect(zero.status).toBe(400);
    const noNote = await callRoute(creditsRoute as Handler, { body: { delta: 3, note: " " }, params: p(member.id) });
    expect(noNote.status).toBe(400);
    const tooMuch = await callRoute(creditsRoute as Handler, { body: { delta: -50, note: "clawback" }, params: p(member.id) });
    expect(tooMuch.status).toBe(402);
    const missing = await callRoute(creditsRoute as Handler, { body: { delta: 1, note: "x" }, params: p("usr_missing") });
    expect(missing.status).toBe(404);
  });

  it("suspend + unsuspend round trip; cannot suspend yourself", async () => {
    const self = await callRoute(suspendRoute as Handler, { body: { reason: "test" }, params: p(admin.id) });
    expect(self.status).toBe(403);

    const res = await callRoute(suspendRoute as Handler, { body: { reason: "Spam accounts" }, params: p(member.id) });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ suspended: true });
    expect((await db.select().from(user).where(eq(user.id, member.id)))[0]!.banned).toBe(true);

    const un = await callRoute(unsuspendRoute as Handler, { method: "POST", params: p(member.id) });
    expect(un.json).toEqual({ unsuspended: true });
  });

  it("GET /users and /users/:id return data for admins", async () => {
    const list = await callRoute(usersRoute, { url: "/api/admin/users?q=member@" });
    expect(list.status).toBe(200);
    expect(list.json.users.map((u: { id: string }) => u.id)).toEqual([member.id]);
    const detail = await callRoute(userDetailRoute as Handler, { url: "/", params: p(member.id) });
    expect(detail.json.user.email).toBe("member@example.com");
    expect(typeof detail.json.user.createdAt).toBe("string");
  });

  it("GET /stats validates days", async () => {
    expect((await callRoute(statsRoute, { url: "/api/admin/stats?days=7" })).json.stats.period.days).toBe(7);
    expect((await callRoute(statsRoute, { url: "/api/admin/stats?days=0" })).status).toBe(400);
  });

  it("POST /jobs/:id/refund accepts an empty body", async () => {
    const job = await createTestJob(member.id, { status: "failed", creditsCharged: 4 });
    await debitForJob({ userId: member.id, jobId: job.id, amount: 4 });
    const res = await callRoute(refundRoute as Handler, { method: "POST", params: p(job.id) });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ refunded: 4, creditsRefunded: 4 });
    const again = await callRoute(refundRoute as Handler, { body: { note: "again" }, params: p(job.id) });
    expect(again.status).toBe(409);
    expect((await callRoute(listJobsRoute, { url: "/api/admin/jobs?status=bogus" })).status).toBe(400);
  });

  it("moderation queue, resolve and review", async () => {
    const report = await createReport({ targetUserId: member.id });
    const event = await createModerationEvent({ userId: member.id });
    const queue = await callRoute(moderationRoute, { url: "/api/admin/moderation" });
    expect(queue.json.reports).toHaveLength(1);
    expect(queue.json.events).toHaveLength(1);

    const bad = await callRoute(resolveRoute as Handler, { body: { action: "ban" }, params: p(report.id) });
    expect(bad.status).toBe(400);
    const ok = await callRoute(resolveRoute as Handler, { body: { action: "dismiss", note: "dupe" }, params: p(report.id) });
    expect(ok.status).toBe(200);
    expect(ok.json.report.status).toBe("dismissed");

    const reviewed = await callRoute(reviewEventRoute as Handler, { method: "POST", params: p(event.id) });
    expect(reviewed.json).toEqual({ event: { id: event.id, reviewed: true } });
  });
});
