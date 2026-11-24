/**
 * Shared fixtures for job-engine / media tests.
 *
 *   vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyMock);
 *
 * The safety module is replaced by a deterministic fake: images are judged by the mock moderation
 * provider (pixel markers, so `[mock:nsfw-output]` outputs are blocked), likeness scores come from
 * `safetyState.likeness`, text containing "forbidden-word" is blocked, and moderation events are
 * written to the real `moderation_events` table.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { vi } from "vitest";
import { db } from "@/db";
import { moderationEvents } from "@/db/schema";
import { createMockAIProvider, type MockAIProvider } from "@/providers/mock/ai";
import { createMockModerationProvider } from "@/providers/mock/moderation";
import { setProviderOverrides } from "@/providers/registry";
import { createLocalStorage } from "@/providers/storage/local";
import { errors } from "@/server/http";
import { setStorageForTesting } from "@/server/storage";
import type { ModerationEventKind, ModerationSnapshot } from "@/types/domain";

export const BLOCKED_WORD = "forbidden-word";

export const safetyState: {
  /** Likeness per call (consumed in order); falls back to `defaultLikeness`. */
  likeness: (number | null)[];
  defaultLikeness: number | null;
} = { likeness: [], defaultLikeness: null };

const moderation = createMockModerationProvider();
const snapshot = (allowed: boolean, categories: string[] = []): ModerationSnapshot => ({
  checkedAt: new Date().toISOString(),
  provider: "mock",
  allowed,
  categories,
});

async function record(kind: ModerationEventKind, ctx: { userId: string; jobId?: string; modelId?: string }, details: Record<string, unknown>) {
  await db.insert(moderationEvents).values({ kind, userId: ctx.userId, jobId: ctx.jobId ?? null, modelId: ctx.modelId ?? null, details });
}

export const safetyMock = {
  recordModerationEvent: vi.fn(record),
  assertTextAllowed: vi.fn(async (texts: string[], ctx: { userId: string; jobId?: string; modelId?: string }) => {
    if (texts.some((t) => t.toLowerCase().includes(BLOCKED_WORD))) {
      await record("prompt_blocked", ctx, { texts });
      throw errors.contentBlocked();
    }
  }),
  checkOutputImage: vi.fn(async (bytes: Uint8Array, ctx: { userId: string; jobId?: string }) => {
    const r = await moderation.checkImage(bytes);
    if (!r.allowed) await record("output_blocked", ctx, { categories: r.categories });
    return snapshot(r.allowed, r.categories);
  }),
  checkOutputVideo: vi.fn(async () => snapshot(true)),
  assertReferenceImageAllowed: vi.fn(async () => ({ face: { count: 1 }, moderation: snapshot(true) })),
  likenessScore: vi.fn(async () => (safetyState.likeness.length ? safetyState.likeness.shift()! : safetyState.defaultLikeness)),
  verifyConsentSelfie: vi.fn(async () => {
    throw new Error("not used in job tests");
  }),
  analyzeTrainingPhotoSafety: vi.fn(async () => {
    throw new Error("not used in job tests");
  }),
  assertTrainingAllowed: vi.fn(async () => undefined),
  assertModelsUsable: vi.fn(async () => []),
};

export function resetSafety() {
  safetyState.likeness = [];
  safetyState.defaultLikeness = null;
  for (const fn of Object.values(safetyMock)) fn.mockClear();
}

/** Fresh local storage in a temp dir; returns a cleanup function. */
export async function useTempStorage(): Promise<() => Promise<void>> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-jobs-"));
  setStorageForTesting(createLocalStorage({ dir, baseUrl: "http://localhost:3000", secret: "jobs-test-secret" }));
  return async () => {
    setStorageForTesting(null);
    await fs.rm(dir, { recursive: true, force: true });
  };
}

/** Install a mock AI provider with some methods replaced (name stays "mock"). */
export function overrideMockAI(patch: Partial<MockAIProvider> = {}): MockAIProvider {
  const provider: MockAIProvider = { ...createMockAIProvider(), ...patch };
  setProviderOverrides({ image: provider, training: provider, video: provider });
  return provider;
}

/** A small valid PNG (solid colour). */
export async function pngBytes(width = 64, height = 64): Promise<Uint8Array<ArrayBuffer>> {
  const buf = await sharp({ create: { width, height, channels: 3, background: { r: 120, g: 140, b: 160 } } })
    .png()
    .toBuffer();
  return Uint8Array.from(buf);
}
