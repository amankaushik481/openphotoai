/**
 * Shared setup for account tests: a temp local storage, a mock payment provider and an account
 * seeded with one row (and file) in every table account deletion has to deal with.
 *
 *   const state = vi.hoisted(() => ({ payment: null as unknown }));
 *   vi.mock("@/providers/registry", async () => (await import("./fixtures")).registryMock(state));
 */
import { eq } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import { db } from "@/db";
import * as schema from "@/db/schema";
import type { UserRow } from "@/db/types";
import { newId } from "@/lib/ids";
import { createMockEmailProvider } from "@/providers/email/mock";
import { createLocalStorage, type LocalStorageProvider } from "@/providers/storage/local";
import type { PaymentProvider } from "@/providers/types";
import { setStorageForTesting, storageKeys } from "@/server/storage";
import { createTestJob, createTestMedia, createTestModel, createTestUpload, createTestUser } from "../../helpers/factories";

export function registryMock(state: { payment: unknown }) {
  const email = createMockEmailProvider();
  return {
    getEmailProvider: () => email,
    getPaymentProvider: () => {
      if (!state.payment) throw new Error("payment provider not configured");
      return state.payment as PaymentProvider;
    },
  };
}

export function createPaymentProviderMock(): PaymentProvider & { cancelSubscription: ReturnType<typeof vi.fn> } {
  return {
    name: "mock",
    createCheckout: vi.fn(),
    createPortal: vi.fn(),
    parseWebhook: vi.fn(),
    getSubscription: vi.fn(async () => null),
    cancelSubscription: vi.fn(async () => undefined),
  };
}

export async function useTempStorage(): Promise<{ storage: LocalStorageProvider; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "openshoot-account-"));
  const storage = createLocalStorage({ dir, baseUrl: "http://localhost:3000", secret: "account-test-secret" });
  setStorageForTesting(storage);
  return {
    storage,
    cleanup: async () => {
      setStorageForTesting(null);
      await rm(dir, { recursive: true, force: true });
    },
  };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

export interface SeededAccount {
  user: UserRow;
  modelIds: string[];
  mediaId: string;
  uploadId: string;
  jobId: string;
  shareToken: string;
  storageKeys: string[];
}

/** One of everything a real account accumulates. `email` should be lowercase. */
export async function seedAccount(storage: LocalStorageProvider, email: string): Promise<SeededAccount> {
  const user = await createTestUser({ email, name: "Ada", stripeCustomerId: `cus_${email.length}x` });
  const m1 = await createTestModel(user.id, { name: "Me" });
  const m2 = await createTestModel(user.id, { name: "Me (instant)", metadata: { mode: "instant" } });
  const photoId = newId("tph");
  const photoKey = storageKeys.trainingPhoto(user.id, m1.id, photoId);
  await db.insert(schema.trainingPhotos).values({
    id: photoId,
    modelId: m1.id,
    userId: user.id,
    storageKey: photoKey,
    width: 1024,
    height: 1024,
    status: "accepted",
  });
  const consentKey = storageKeys.consentSelfie(user.id, m1.id, "c1");
  await db.update(schema.identityModels).set({ consentSelfieKey: consentKey }).where(eq(schema.identityModels.id, m1.id));

  const job = await createTestJob(user.id, { modelId: m1.id, status: "running", providerRequestId: `req_${user.id}` });
  const medium = await createTestMedia(user.id, { jobId: job.id, modelId: m1.id, prompt: "me on a yacht" });
  const upload = await createTestUpload(user.id);
  const shareToken = `share_${user.id}`;
  await db.insert(schema.shareLinks).values({ token: shareToken, userId: user.id, mediaId: medium.id });

  await db.insert(schema.subscriptions).values({
    userId: user.id,
    provider: "mock",
    providerSubscriptionId: `sub_${user.id}`,
    providerCustomerId: user.stripeCustomerId,
    planId: "pro",
    status: "active",
    lastEventAt: new Date(),
  });
  await db.insert(schema.payments).values({
    userId: user.id,
    provider: "mock",
    providerPaymentId: `cs_${user.id}`,
    kind: "subscription",
    productId: "pro",
    amountCents: 3900,
    credits: 600,
    status: "paid",
  });
  await db.insert(schema.creditLedger).values({
    userId: user.id,
    delta: 600,
    balanceAfter: 600,
    reason: "subscription_grant",
    idempotencyKey: `grant:${user.id}`,
  });
  await db.insert(schema.session).values({
    id: newId("ses"),
    token: `tok_${user.id}`,
    userId: user.id,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  await db.insert(schema.account).values({ id: newId("acc"), accountId: "g-123", providerId: "google", userId: user.id });
  await db.insert(schema.apiKeys).values({ userId: user.id, name: "ci", prefix: "os_live_abcd", keyHash: `hash_${user.id}` });
  const [team] = await db.insert(schema.teams).values({ ownerId: user.id, name: "Ada & Co" }).returning();
  await db.insert(schema.brandKits).values({ teamId: team!.id, name: "Default" });
  await db
    .insert(schema.teamMembers)
    .values({ teamId: team!.id, userId: user.id, email, role: "owner", status: "active" });

  await db.insert(schema.moderationEvents).values({
    userId: user.id,
    jobId: job.id,
    kind: "prompt_blocked",
    details: {
      categories: ["sexual"],
      canonical: ["sexual"],
      text: { excerpt: "a very private prompt", sha256: "deadbeef", length: 21 },
      error: "provider said: a very private prompt",
    },
  });
  await db.insert(schema.reports).values({
    reporterUserId: user.id,
    reporterEmail: email,
    reason: "other",
    details: "written by the deleted user",
  });
  await db.insert(schema.emailOutbox).values([
    { userId: user.id, to: email, subject: "Welcome", template: "welcome", html: "<p>hi</p>", status: "mocked" },
    { userId: null, to: email.toUpperCase(), subject: "Sign in", template: "magic_link", html: "<p>x</p>", status: "mocked" },
  ]);
  await db.insert(schema.rateLimits).values({ key: `jobsPerMinute:user:${user.id}`, windowStart: new Date(), count: 3 });
  await db.insert(schema.webhookEvents).values({
    source: "mock-payments",
    eventId: `evt_${user.id}`,
    type: "checkout.completed",
    processedAt: new Date(),
    payload: { customer_email: email, metadata: { userId: user.id } },
  });

  const keys = [photoKey, consentKey, medium.storageKey, medium.thumbKey!, upload.storageKey];
  for (const key of keys) await storage.put(key, JPEG, { contentType: "image/jpeg" });

  return {
    user,
    modelIds: [m1.id, m2.id],
    mediaId: medium.id,
    uploadId: upload.id,
    jobId: job.id,
    shareToken,
    storageKeys: keys,
  };
}
