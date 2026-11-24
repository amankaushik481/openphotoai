import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import * as schema from "@/db/schema";
import type { LocalStorageProvider } from "@/providers/storage/local";
import { AppError } from "@/server/http";
import { storageKeys } from "@/server/storage";
import { createTestDb, createTestMedia, createTestUser } from "../../helpers/factories";
import { createPaymentProviderMock, seedAccount, useTempStorage, type SeededAccount } from "./fixtures";

const state = vi.hoisted(() => ({ payment: null as unknown }));
vi.mock("@/providers/registry", async () => (await import("./fixtures")).registryMock(state));
vi.mock("@/server/models/service", async () => {
  const { and: andOp, eq: eqOp } = await import("drizzle-orm");
  const { db: database } = await import("@/db");
  const { identityModels } = await import("@/db/schema");
  return {
    // Stand-in for the models workstream: removes the row like the real one does.
    deleteModelCompletely: vi.fn(async (userId: string, modelId: string) => {
      await database
        .delete(identityModels)
        .where(andOp(eqOp(identityModels.id, modelId), eqOp(identityModels.userId, userId)));
    }),
  };
});
vi.mock("@/server/jobs/engine", () => ({ cancelJob: vi.fn(async () => ({})) }));

const { confirmAccountDeletion, hashDeletionToken, requestAccountDeletion, deleteAccountCompletely } = await import(
  "@/server/account"
);
const { deleteModelCompletely } = await import("@/server/models/service");
const { cancelJob } = await import("@/server/jobs/engine");

const EMAIL = "ada@example.com";
const HOUR = 3600_000;

let storage: LocalStorageProvider;
let cleanup: () => Promise<void>;
let payment: ReturnType<typeof createPaymentProviderMock>;

beforeEach(async () => {
  await createTestDb();
  ({ storage, cleanup } = await useTempStorage());
  payment = createPaymentProviderMock();
  state.payment = payment;
  vi.mocked(deleteModelCompletely).mockClear();
  vi.mocked(cancelJob).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

async function outbox(template?: string) {
  const rows = await db.select().from(schema.emailOutbox);
  return template ? rows.filter((r) => r.template === template) : rows;
}

/** The token from the newest confirmation email (mock deliveries keep the link). */
async function lastEmailedToken(): Promise<string> {
  const mails = await outbox("deletion_confirm_request");
  const text = mails.at(-1)?.text ?? "";
  const match = /\/account\/delete\/confirm\?token=([A-Za-z0-9]+)/.exec(text);
  if (!match) throw new Error(`no confirmation link in: ${text}`);
  return match[1]!;
}

async function requestRows(userId: string) {
  return db.select().from(schema.deletionRequests).where(eq(schema.deletionRequests.userId, userId));
}

async function expectAppError(promise: Promise<unknown>, code: string, reason?: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (reason) expect((err as AppError).details).toMatchObject({ reason });
}

describe("requestAccountDeletion", () => {
  it("stores only a sha256 of the token, expires in 24h and emails the confirmation link", async () => {
    const user = await createTestUser({ email: EMAIL });
    const before = Date.now();
    const { expiresAt } = await requestAccountDeletion(user);
    const token = await lastEmailedToken();

    const [row] = await requestRows(user.id);
    expect(row).toMatchObject({ status: "pending", email: EMAIL, tokenHash: hashDeletionToken(token) });
    expect(row!.tokenHash).not.toContain(token);
    expect(row!.expiresAt.getTime()).toBe(expiresAt.getTime());
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(24 * HOUR - 1000);
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(24 * HOUR + 5000);

    const [mail] = await outbox("deletion_confirm_request");
    expect(mail).toMatchObject({ to: EMAIL, userId: user.id, status: "mocked" });
    expect(mail!.text).toContain(`http://localhost:3000/account/delete/confirm?token=${token}`);
  });

  it("supersedes the previous pending request", async () => {
    const user = await createTestUser({ email: EMAIL });
    await requestAccountDeletion(user);
    const first = await lastEmailedToken();
    await requestAccountDeletion(user);
    const second = await lastEmailedToken();
    expect(second).not.toBe(first);

    const rows = await requestRows(user.id);
    expect(rows.map((r) => r.status).sort()).toEqual(["expired", "pending"]);
    await expectAppError(confirmAccountDeletion(first), "not_found", "invalid");
  });

  it("allows at most 3 requests per 24 hours", async () => {
    const user = await createTestUser({ email: EMAIL });
    for (let i = 0; i < 3; i++) await requestAccountDeletion(user);
    await expectAppError(requestAccountDeletion(user), "rate_limited");
    expect(await requestRows(user.id)).toHaveLength(3);

    // Requests older than a day no longer count.
    await db
      .update(schema.deletionRequests)
      .set({ createdAt: new Date(Date.now() - 25 * HOUR) })
      .where(eq(schema.deletionRequests.userId, user.id));
    await expect(requestAccountDeletion(user)).resolves.toMatchObject({ requestId: expect.any(String) });
  });
});

describe("confirmAccountDeletion — token checks", () => {
  it("rejects unknown and empty tokens", async () => {
    await expectAppError(confirmAccountDeletion("nope"), "not_found", "invalid");
    await expectAppError(confirmAccountDeletion("   "), "not_found", "invalid");
  });

  it("rejects an expired link, marks it expired and deletes nothing", async () => {
    const user = await createTestUser({ email: EMAIL });
    await requestAccountDeletion(user);
    const token = await lastEmailedToken();
    await db
      .update(schema.deletionRequests)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.deletionRequests.userId, user.id));

    await expectAppError(confirmAccountDeletion(token), "not_found", "expired");
    const [row] = await requestRows(user.id);
    expect(row!.status).toBe("expired");
    const [still] = await db.select().from(schema.user).where(eq(schema.user.id, user.id));
    expect(still).toMatchObject({ deletedAt: null, banned: false });
    // Once expired it stays unusable.
    await expectAppError(confirmAccountDeletion(token), "not_found", "invalid");
  });
});

describe("confirmAccountDeletion — real deletion", () => {
  let seeded: SeededAccount;
  let other: SeededAccount;

  beforeEach(async () => {
    seeded = await seedAccount(storage, EMAIL);
    other = await seedAccount(storage, "grace@example.com");
  });

  async function confirm(): Promise<{ status: string }> {
    await requestAccountDeletion(seeded.user);
    return confirmAccountDeletion(await lastEmailedToken());
  }

  it("deletes models at the provider, storage, rows, cancels billing and sends the final email", async () => {
    await expect(confirm()).resolves.toEqual({ status: "completed" });
    const { user } = seeded;

    // Provider-side models: every identity model went through deleteModelCompletely.
    expect(vi.mocked(deleteModelCompletely).mock.calls.map((c) => c.slice(0, 2))).toEqual(
      expect.arrayContaining(seeded.modelIds.map((id) => [user.id, id])),
    );
    expect(deleteModelCompletely).toHaveBeenCalledTimes(2);
    expect(deleteModelCompletely).toHaveBeenCalledWith(user.id, seeded.modelIds[0], { notify: false });
    // In-flight job canceled at the provider, subscription canceled at the payment provider.
    expect(cancelJob).toHaveBeenCalledWith(user.id, seeded.jobId);
    expect(payment.cancelSubscription).toHaveBeenCalledExactlyOnceWith(`sub_${user.id}`);

    // Storage: the whole users/<id>/ prefix is gone, the other account's files are untouched.
    for (const key of seeded.storageKeys) expect(await storage.exists(key)).toBe(false);
    for (const key of other.storageKeys) expect(await storage.exists(key)).toBe(true);
    expect(await storage.deletePrefix(storageKeys.userPrefix(user.id))).toBe(0);

    // Rows: the user and everything that cascades from it.
    const count = db.$count.bind(db);
    expect({
      user: await count(schema.user, eq(schema.user.id, user.id)),
      session: await count(schema.session, eq(schema.session.userId, user.id)),
      account: await count(schema.account, eq(schema.account.userId, user.id)),
      identityModels: await count(schema.identityModels, eq(schema.identityModels.userId, user.id)),
      trainingPhotos: await count(schema.trainingPhotos, eq(schema.trainingPhotos.userId, user.id)),
      jobs: await count(schema.jobs, eq(schema.jobs.userId, user.id)),
      media: await count(schema.media, eq(schema.media.userId, user.id)),
      uploads: await count(schema.uploads, eq(schema.uploads.userId, user.id)),
      shareLinks: await count(schema.shareLinks, eq(schema.shareLinks.userId, user.id)),
      subscriptions: await count(schema.subscriptions, eq(schema.subscriptions.userId, user.id)),
      payments: await count(schema.payments, eq(schema.payments.userId, user.id)),
      creditLedger: await count(schema.creditLedger, eq(schema.creditLedger.userId, user.id)),
      apiKeys: await count(schema.apiKeys, eq(schema.apiKeys.userId, user.id)),
      teams: await count(schema.teams, eq(schema.teams.ownerId, user.id)),
      teamMembers: await count(schema.teamMembers, eq(schema.teamMembers.userId, user.id)),
    }).toEqual({
      user: 0,
      session: 0,
      account: 0,
      identityModels: 0,
      trainingPhotos: 0,
      jobs: 0,
      media: 0,
      uploads: 0,
      shareLinks: 0,
      subscriptions: 0,
      payments: 0,
      creditLedger: 0,
      apiKeys: 0,
      teams: 0,
      teamMembers: 0,
    });
    expect(await count(schema.brandKits)).toBe(1); // only the other account's kit
    expect(await count(schema.media, eq(schema.media.userId, other.user.id))).toBe(1);

    // No-FK tables: outbox copies, rate-limit counters, webhook payloads mentioning the user.
    const mails = await outbox();
    expect(mails.filter((m) => m.userId === user.id)).toEqual([]);
    expect(mails.filter((m) => m.to.toLowerCase() === EMAIL).map((m) => m.template)).toEqual(["deletion_completed"]);
    expect(mails.filter((m) => m.userId === other.user.id).length).toBeGreaterThan(0);
    const limits = await db.select().from(schema.rateLimits);
    expect(limits.map((l) => l.key)).not.toContain(`jobsPerMinute:user:${user.id}`);
    expect(limits.map((l) => l.key)).toContain(`jobsPerMinute:user:${other.user.id}`);
    const hooks = await db.select().from(schema.webhookEvents);
    expect(hooks.find((h) => h.eventId === `evt_${user.id}`)!.payload).toBeNull();
    expect(hooks.find((h) => h.eventId === `evt_${other.user.id}`)!.payload).not.toBeNull();

    // Safety records survive, anonymized.
    const [event] = await db
      .select()
      .from(schema.moderationEvents)
      .where(eq(schema.moderationEvents.jobId, seeded.jobId));
    expect(event!.userId).toBeNull();
    expect(event!.details).toEqual({
      categories: ["sexual"],
      canonical: ["sexual"],
      text: { sha256: "deadbeef", length: 21 },
      anonymized: true,
    });
    const otherEvents = await db
      .select()
      .from(schema.moderationEvents)
      .where(eq(schema.moderationEvents.userId, other.user.id));
    expect(otherEvents[0]!.details).toHaveProperty("text.excerpt");
    const reports = await db.select().from(schema.reports);
    expect(reports).toHaveLength(2);
    expect(reports.filter((r) => r.reporterUserId === null)).toEqual([
      expect.objectContaining({ reason: "other", reporterEmail: null, details: null }),
    ]);
    expect(reports.find((r) => r.reporterUserId === other.user.id)!.details).toBe("written by the deleted user");

    // The request: completed, with a full report; the address is reduced to a hash.
    const [request] = await requestRows(user.id);
    expect(request).toMatchObject({ status: "completed", completedAt: expect.any(Date) });
    expect(request!.email).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(request!.report).toMatchObject({
      attempts: 1,
      finishedAt: expect.any(String),
      leaseUntil: null,
      summary: { identityModels: 2, trainingPhotos: 1, media: 1, uploads: 1, jobs: 1, shareLinks: 1, subscriptions: 1 },
      steps: {
        lock: { status: "done" },
        jobs: { status: "done", counts: { canceled: 1, failed: 0 } },
        subscriptions: { status: "done", counts: { canceled: 1, failed: 0 } },
        models: { status: "done", counts: { deleted: 2 } },
        records: { status: "done", counts: { users: 1 } },
        storage: { status: "done", counts: { objects: 5 } },
      },
      warnings: [],
    });

    // Final email, to the stored address.
    const [done] = await outbox("deletion_completed");
    expect(done).toMatchObject({ to: EMAIL, userId: null });
    expect(done!.text).toContain("2 identity models");
  });

  it("is idempotent: a reused link after completion deletes nothing more and sends no second email", async () => {
    await requestAccountDeletion(seeded.user);
    const token = await lastEmailedToken();
    await expect(confirmAccountDeletion(token)).resolves.toEqual({ status: "completed" });
    vi.mocked(deleteModelCompletely).mockClear();

    await expect(confirmAccountDeletion(token)).resolves.toEqual({ status: "completed" });
    expect(deleteModelCompletely).not.toHaveBeenCalled();
    expect(await outbox("deletion_completed")).toHaveLength(1);
  });

  it("locks the account first and resumes where a failed run stopped", async () => {
    vi.mocked(deleteModelCompletely).mockRejectedValueOnce(new Error("fal: 503 Service Unavailable"));
    await requestAccountDeletion(seeded.user);
    const token = await lastEmailedToken();
    await expectAppError(confirmAccountDeletion(token), "provider_error", "incomplete");

    // Half-deleted but unusable: flagged deleted + banned, no sessions, keys and share links revoked.
    const { user } = seeded;
    const [locked] = await db.select().from(schema.user).where(eq(schema.user.id, user.id));
    expect(locked).toMatchObject({ banned: true, deletedAt: expect.any(Date) });
    expect(await db.select().from(schema.session).where(eq(schema.session.userId, user.id))).toEqual([]);
    const [key] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId, user.id));
    expect(key!.revokedAt).toBeInstanceOf(Date);
    const [link] = await db.select().from(schema.shareLinks).where(eq(schema.shareLinks.token, seeded.shareToken));
    expect(link!.revokedAt).toBeInstanceOf(Date);

    const [failed] = await requestRows(user.id);
    expect(failed).toMatchObject({ status: "confirmed", completedAt: null, email: EMAIL });
    expect(failed!.report).toMatchObject({
      attempts: 1,
      leaseUntil: null,
      error: expect.stringContaining("fal: 503"),
      steps: { lock: { status: "done" }, models: { status: "failed" } },
    });
    expect(await outbox("deletion_completed")).toEqual([]);

    // Retry with the same link (the user can't request a new one while locked out).
    await expect(confirmAccountDeletion(token)).resolves.toEqual({ status: "completed" });
    const [done] = await requestRows(user.id);
    expect(done!.report).toMatchObject({ attempts: 2, steps: { lock: { status: "done" }, models: { status: "done" } } });
    expect(done!.report).not.toHaveProperty("error");
    expect(cancelJob).toHaveBeenCalledTimes(1); // finished steps are not re-run
    expect(await db.select().from(schema.user).where(eq(schema.user.id, user.id))).toEqual([]);
    expect(await outbox("deletion_completed")).toHaveLength(1);
  });

  it("treats subscription cancellation as best effort and records the failure", async () => {
    payment.cancelSubscription.mockRejectedValueOnce(new Error("stripe: network down"));
    await expect(confirm()).resolves.toEqual({ status: "completed" });
    const [request] = await requestRows(seeded.user.id);
    expect(request!.report).toMatchObject({
      steps: { subscriptions: { status: "done", counts: { canceled: 0, failed: 1 } } },
      warnings: [expect.stringContaining("stripe: network down")],
    });
  });

  it("answers in_progress while another run holds the lease", async () => {
    await requestAccountDeletion(seeded.user);
    const token = await lastEmailedToken();
    await db
      .update(schema.deletionRequests)
      .set({ status: "confirmed", report: { leaseUntil: new Date(Date.now() + 60_000).toISOString() } })
      .where(eq(schema.deletionRequests.userId, seeded.user.id));

    await expect(confirmAccountDeletion(token)).resolves.toEqual({ status: "in_progress" });
    expect(deleteModelCompletely).not.toHaveBeenCalled();
  });
});

describe("deleteAccountCompletely", () => {
  it("can resume after the user row is gone (storage only)", async () => {
    const user = await createTestUser({ email: EMAIL });
    const medium = await createTestMedia(user.id);
    await storage.put(medium.storageKey, new Uint8Array([1]), { contentType: "image/jpeg" });
    const first = await deleteAccountCompletely(user.id);
    expect(first.finishedAt).toEqual(expect.any(String));

    // A late provider output lands after the first run: a resumed storage step still removes it.
    await storage.put(storageKeys.media(user.id, "med_late", "jpg"), new Uint8Array([1]), { contentType: "image/jpeg" });
    const steps = { ...first.steps };
    delete steps.storage;
    const second = await deleteAccountCompletely(user.id, { previous: { ...first, steps }, email: EMAIL });
    expect(second.steps.storage).toMatchObject({ status: "done", counts: { objects: 1 } });
    expect(second.attempts).toBe(2);
  });

  it("refuses ids that would widen the storage prefix", async () => {
    await expect(deleteAccountCompletely("")).rejects.toThrow(/unsafe id/);
    await expect(deleteAccountCompletely("../x")).rejects.toThrow(/unsafe id/);
  });
});
