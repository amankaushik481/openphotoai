/**
 * Minimal provider registry used by job tests only while the real registry can't load (a provider
 * module it imports statically hasn't landed yet). Mirrors the real API for the AI providers.
 *
 *   vi.mock("@/providers/registry", async (importOriginal) =>
 *     importOriginal().catch(async () => (await import("./registry-fallback")).fallbackRegistry));
 */
import { createMockAIProvider, type MockAIProvider } from "@/providers/mock/ai";
import { createMockFaceProvider } from "@/providers/mock/face";
import { createMockModerationProvider } from "@/providers/mock/moderation";
import type { ImageProvider, TrainingProvider, VideoProvider } from "@/providers/types";
import { getStorage } from "@/server/storage";

let overrides: { image?: ImageProvider; training?: TrainingProvider; video?: VideoProvider } | null = null;
let ai: MockAIProvider | null = null;
const mock = () => (ai ??= createMockAIProvider());

export const fallbackRegistry = {
  setProviderOverrides(o: typeof overrides) {
    overrides = o ? { ...o } : null;
    if (!o) ai = null;
  },
  getImageProvider: () => overrides?.image ?? mock(),
  getTrainingProvider: () => overrides?.training ?? mock(),
  getVideoProvider: () => overrides?.video ?? mock(),
  getAIProvider: (name: string) =>
    [overrides?.image, overrides?.training, overrides?.video].find((p) => p?.name === name) ?? mock(),
  getModerationProvider: () => createMockModerationProvider(),
  getFaceProvider: () => createMockFaceProvider(),
  getStorageProvider: () => getStorage(),
};
