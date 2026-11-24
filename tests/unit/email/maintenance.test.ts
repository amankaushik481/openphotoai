import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deletionRequests, emailOutbox, jobs, modelShares, rateLimits, user } from "@/db/schema";
import { createMockEmailProvider } from "@/providers/email/mock";
import type { EmailProvider } from "@/providers/types";
import { createTestDb, createTestUser } from "../../helpers/db";

const registry = vi.hoisted(() => ({ provider: null as unknown }));
vi.mock("@/providers/registry", () => ({ getEmailProvider: () => registry.provider }));
vi.mock("@/server/auth/session", () => ({
  resolveRequestAuth: async () => ({ user: null, apiKey: null }),
}));
// Account deletion is covered by tests/unit/account; here we only check maintenance runs it.
const resumeStalledDeletions = vi.hoisted(() => vi.fn<(now?: Date) => Promise<number>>(async () => 0));
vi.mock("@/server/account", () => ({ resumeStalledDeletions }));

const { findLowCreditCandidates, runMaintenance, sendLowCreditReminders, isCronAuthorized } = await import(
  "@/server/maintenance"
);
const { GET } = await import("@/app/api/cron/maintenance/route");

const DAY = 86_400_000;
const NOW = new Date("2026-06-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  db = await createTestDb();
  registry.provider = createMockEmailProvider();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function userWith(opts: {
  credits: number;
  lastJobDaysAgo?: number;
  notifiedDaysAgo?: number;
  banned?: boolean;
  deleted?: boolean;
}) {
  const u = await createTestUser({
    credits: opts.credits,
    banned: opts.banned ?? false,
    deletedAt: opts.deleted ? daysAgo(1) : null,
    lowCreditsNotifiedAt: opts.notifiedDaysAgo === undefined ? null : daysAgo(opts.notifiedDaysAgo),
  });
  if (opts.lastJobDaysAgo !== undefined) {
    await db.insert(jobs).values({
      userId: u.id,
      type: "train",
      status: "succeeded",
      input: { type: "train", modelId: "mdl_test" },
      createdAt: daysAgo(opts.lastJobDaysAgo),
    });
  }
  return u;
}

describe("low-credit reminders", () => {
  it("selects active low-balance users not reminded in the last 14 days", async () => {
    const eligible = await userWith({ credits: 5, lastJobDaysAgo: 2 });
    const remindedLongAgo = await userWith({ credits: 0, lastJobDaysAgo: 10, notifiedDaysAgo: 20 });
    await userWith({ credits: 10, lastJobDaysAgo: 1 }); // not below threshold
    await userWith({ credits: 5 }); // never created a job
    await userWith({ credits: 5, lastJobDaysAgo: 40 }); // inactive
    await userWith({ credits: 5, lastJobDaysAgo: 1, notifiedDaysAgo: 3 }); // reminded recently
    await userWith({ credits: 5, lastJobDaysAgo: 1, banned: true });
    await userWith({ credits: 5, lastJobDaysAgo: 1, deleted: true });

    const candidates = await findLowCreditCandidates(NOW);
    expect(candidates.map((c) => c.id).sort()).toEqual([eligible.id, remindedLongAgo.id].sort());
  });

  it("emails each candidate once and stamps lowCreditsNotifiedAt", async () => {
    const u = await userWith({ credits: 4, lastJobDaysAgo: 2 });

    expect(await sendLowCreditReminders(NOW)).toBe(1);
    const [row] = await db.select().from(user).where(eq(user.id, u.id));
    expect(row!.lowCreditsNotifiedAt?.toISOString()).toBe(NOW.toISOString());

    const emails = await db.select().from(emailOutbox).where(eq(emailOutbox.userId, u.id));
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ template: "low_credits", to: u.email, status: "mocked" });
    expect(emails[0]!.html).toContain("/app/billing");

    // A second run (or an overlapping one) sends nothing.
    expect(await sendLowCreditReminders(new Date(NOW.getTime() + 60_000))).toBe(0);
  });

  it("releases the claim when delivery fails so the next run retries", async () => {
    const failing: EmailProvider = { name: "resend", send: async () => Promise.reject(new Error("down")) };
    registry.provider = failing;
    const u = await userWith({ credits: 1, lastJobDaysAgo: 1 });

    expect(await sendLowCreditReminders(NOW)).toBe(0);
    const [row] = await db.select().from(user).where(eq(user.id, u.id));
    expect(row!.lowCreditsNotifiedAt).toBeNull();
  });
});

describe("runMaintenance", () => {
  it("expires stale invites + deletion requests and prunes old rows", async () => {
    const u = await createTestUser();
    const share = (status: "pending" | "accepted", expiresAt: Date) => ({
      requesterUserId: u.id,
      inviteeEmail: "friend@example.com",
      tokenHash: `hash_${Math.random()}`,
      status,
      expiresAt,
    });
    await db.insert(modelShares).values([
      share("pending", daysAgo(1)),
      share("pending", daysAgo(-1)),
      share("accepted", daysAgo(1)),
    ]);
    const deletion = (status: "pending" | "completed", expiresAt: Date) => ({
      userId: u.id,
      email: u.email,
      tokenHash: `hash_${Math.random()}`,
      status,
      expiresAt,
    });
    await db.insert(deletionRequests).values([
      deletion("pending", daysAgo(1)),
      deletion("pending", daysAgo(-1)),
      deletion("completed", daysAgo(1)),
    ]);
    await db.insert(rateLimits).values([
      { key: "jobsPerDay:user:1", windowStart: daysAgo(3), count: 4 },
      { key: "jobsPerDay:user:1", windowStart: daysAgo(1), count: 4 },
    ]);
    await db.insert(emailOutbox).values([
      { to: "a@example.com", subject: "old", template: "welcome", html: "<p/>", status: "mocked", createdAt: daysAgo(120) },
      { to: "a@example.com", subject: "new", template: "welcome", html: "<p/>", status: "mocked", createdAt: daysAgo(5) },
    ]);
    await userWith({ credits: 2, lastJobDaysAgo: 1 });

    resumeStalledDeletions.mockResolvedValueOnce(2);
    const result = await runMaintenance(NOW);
    expect(result).toEqual({
      lowCreditEmails: 1,
      expiredModelShares: 1,
      expiredDeletionRequests: 1,
      prunedRateLimits: 1,
      prunedEmails: 1,
      resumedDeletions: 2,
      deletedDemoUsers: 0,
      prunedUploads: 0,
    });
    expect(resumeStalledDeletions).toHaveBeenCalledWith(NOW);

    const shares = await db.select({ status: modelShares.status }).from(modelShares);
    expect(shares.map((s) => s.status).sort()).toEqual(["accepted", "expired", "pending"]);
    const deletions = await db.select({ status: deletionRequests.status }).from(deletionRequests);
    expect(deletions.map((d) => d.status).sort()).toEqual(["completed", "expired", "pending"]);
    expect(await db.select().from(rateLimits)).toHaveLength(1);

    // Idempotent.
    expect(await runMaintenance(NOW)).toEqual({
      lowCreditEmails: 0,
      expiredModelShares: 0,
      expiredDeletionRequests: 0,
      prunedRateLimits: 0,
      prunedEmails: 0,
      resumedDeletions: 0,
      deletedDemoUsers: 0,
      prunedUploads: 0,
    });
  });
});

describe("GET /api/cron/maintenance", () => {
  const call = (authorization?: string) =>
    GET(
      new NextRequest("http://localhost:3000/api/cron/maintenance", {
        headers: authorization ? { authorization } : {},
      }),
      { params: Promise.resolve({}) },
    );

  it("rejects missing or wrong secrets with 401", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect((await call("test-cron-secret")).status).toBe(401);
  });

  it("runs maintenance with the right secret", async () => {
    const res = await call("Bearer test-cron-secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, lowCreditEmails: 0, expiredModelShares: 0, resumedDeletions: 0 });
  });

  it("is always unauthorized when CRON_SECRET is not configured", () => {
    const req = new Request("http://x", { headers: { authorization: "Bearer " } });
    expect(isCronAuthorized(req, undefined)).toBe(false);
    expect(isCronAuthorized(new Request("http://x", { headers: { authorization: "Bearer s3cret" } }), "s3cret")).toBe(true);
  });
});
