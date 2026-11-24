/**
 * Shared fixtures for the safety tests: marker images for the mock face/moderation providers,
 * a swappable provider registry (use with `vi.mock("@/providers/registry", ...)`), an
 * in-memory storage provider and moderation_events readers.
 */
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { moderationEvents } from "@/db/schema";
import { createMockFaceProvider, mockFaceEmbedding } from "@/providers/mock/face";
import { encodeMarker, type Marker } from "@/providers/mock/markers";
import { createMockModerationProvider } from "@/providers/mock/moderation";
import type { FaceProvider, ModerationProvider, StorageProvider } from "@/providers/types";
import type { ModerationEventKind } from "@/types/domain";

export const providers: { face: FaceProvider | null; moderation: ModerationProvider | null } = {
  face: null,
  moderation: null,
};

export function useMockProviders(): void {
  providers.face = createMockFaceProvider();
  providers.moderation = createMockModerationProvider();
}

/** Drop-in replacement for the registry's safety getters. */
export const registryMock = {
  getFaceProvider: (): FaceProvider => {
    if (!providers.face) throw new Error("face provider not configured");
    return providers.face;
  },
  getModerationProvider: (): ModerationProvider => {
    if (!providers.moderation) throw new Error("moderation provider not configured");
    return providers.moderation;
  },
};

/** Moderation provider whose every call fails (fail-closed tests). */
export function brokenModeration(): ModerationProvider {
  const fail = async (): Promise<never> => {
    throw new Error("moderation backend down");
  };
  return { name: "broken", checkText: fail, checkImage: fail, detectPublicFigure: fail };
}

export function brokenFace(): FaceProvider {
  return {
    name: "broken",
    matchThreshold: 0.6,
    analyze: async () => {
      throw new Error("face backend down");
    },
  };
}

/** PNG with the mock marker painted in (null = plain image: one adult "default" face). */
export async function markedImage(marker: Partial<Marker> | null = null, size = 256): Promise<Uint8Array> {
  let image = sharp({ create: { width: size, height: size, channels: 3, background: { r: 120, g: 140, b: 160 } } });
  if (marker) image = await encodeMarker(image, marker);
  return new Uint8Array(await image.png().toBuffer());
}

/** The consent embedding a mock identity's selfie produces (base vector, no jitter). */
export function identityEmbedding(identity: Marker["identity"]): number[] {
  return mockFaceEmbedding(identity);
}

export function memoryStorage(objects: Map<string, Uint8Array> = new Map()): StorageProvider {
  return {
    name: "local",
    publiclyReachable: false,
    put: async (key, body) => void objects.set(key, body),
    get: async (key) => {
      const v = objects.get(key);
      if (!v) throw new Error(`missing object ${key}`);
      return v;
    },
    exists: async (key) => objects.has(key),
    delete: async (key) => void objects.delete(key),
    deletePrefix: async () => 0,
    getSignedUrl: async (key) => `memory://${key}`,
  };
}

export async function eventsOf(userId: string, kind?: ModerationEventKind) {
  const rows = await db.select().from(moderationEvents).where(eq(moderationEvents.userId, userId));
  return kind ? rows.filter((r) => r.kind === kind) : rows;
}
