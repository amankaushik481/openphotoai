import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEnv, resetEnvCache } from "@/lib/env";
import type { FaceProvider, ImageProvider, ModerationProvider, StorageProvider } from "@/providers/types";

// Real adapters are replaced by tagged fakes so selection is tested without SDKs or keys.
const fake = (name: string, extra: Record<string, unknown> = {}) => ({ name, ...extra });
vi.mock("@/providers/ai/fal", () => ({ createFalProvider: vi.fn((o: unknown) => fake("fal", { opts: o })) }));
vi.mock("@/providers/ai/replicate", () => ({ createReplicateProvider: vi.fn((o: unknown) => fake("replicate", { opts: o })) }));
vi.mock("@/providers/safety/local-face", () => ({ createLocalFaceProvider: vi.fn(() => fake("local-face")) }));
vi.mock("@/providers/safety/local-moderation", () => ({
  createLocalModerationProvider: vi.fn(() => fake("local-moderation", { checkText: vi.fn(), checkImage: vi.fn() })),
}));
vi.mock("@/providers/safety/openai-moderation", () => ({ createOpenAIModerationProvider: vi.fn(() => fake("openai")) }));
vi.mock("@/providers/safety/rekognition", () => ({
  createRekognitionFaceProvider: vi.fn(() => fake("rekognition")),
  createRekognitionCelebrityDetector: vi.fn(() => async () => ({ isPublicFigure: true, name: "X" })),
}));
vi.mock("@/providers/payment/mock", () => ({ createMockPaymentProvider: vi.fn(() => fake("mock")) }));
vi.mock("@/providers/payment/stripe", () => ({ createStripePaymentProvider: vi.fn(() => fake("stripe")) }));
vi.mock("@/providers/email/mock", () => ({ createMockEmailProvider: vi.fn(() => fake("mock")) }));
vi.mock("@/providers/email/resend", () => ({ createResendEmailProvider: vi.fn(() => fake("resend")) }));
const storage = fake("local") as unknown as StorageProvider;
vi.mock("@/server/storage", () => ({ getStorage: vi.fn(() => storage) }));

const registry = await import("@/providers/registry");

const ENV_KEYS = [
  "MOCK_PROVIDERS",
  "AI_PROVIDER",
  "FAL_KEY",
  "REPLICATE_API_TOKEN",
  "REPLICATE_OWNER",
  "FACE_PROVIDER",
  "MODERATION_PROVIDER",
  "PAYMENT_PROVIDER",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
];
let saved: Record<string, string | undefined>;

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
  registry.setProviderOverrides(null);
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});
afterEach(() => {
  setEnv(saved);
});

describe("provider registry", () => {
  it("uses the mock providers in mock mode and caches instances", () => {
    const image = registry.getImageProvider();
    expect(image.name).toBe("mock");
    expect(registry.getTrainingProvider()).toBe(image);
    expect(registry.getVideoProvider()).toBe(image);
    expect(registry.getAIProvider("mock")).toBe(image);
    expect(registry.getImageProvider()).toBe(image);
    expect(registry.getFaceProvider().name).toBe("mock");
    expect(registry.getFaceProvider()).toBe(registry.getFaceProvider());
    expect(registry.getModerationProvider().name).toBe("mock");
    expect(registry.getPaymentProvider().name).toBe("mock");
    expect(registry.getEmailProvider().name).toBe("mock");
    expect(registry.getStorageProvider()).toBe(storage);
  });

  it("selects real adapters from env", () => {
    setEnv({
      MOCK_PROVIDERS: "false",
      AI_PROVIDER: "fal",
      FAL_KEY: "fal-key",
      FACE_PROVIDER: undefined,
      MODERATION_PROVIDER: undefined,
      PAYMENT_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test",
      STRIPE_WEBHOOK_SECRET: "whsec",
    });
    expect(registry.getImageProvider()).toMatchObject({ name: "fal", opts: { apiKey: "fal-key" } });
    // Real AI defaults the safety providers to the local (non-mock) implementations.
    expect(registry.getFaceProvider().name).toBe("local-face");
    const moderation = registry.getModerationProvider();
    expect(moderation.name).toBe("local-moderation");
    expect(moderation.detectPublicFigure).toBeUndefined();
    expect(registry.getPaymentProvider().name).toBe("stripe");
  });

  it("adds Rekognition celebrity detection to real moderation when AWS is configured", async () => {
    setEnv({ AI_PROVIDER: "fal", FAL_KEY: "k", FACE_PROVIDER: "local", MODERATION_PROVIDER: "local", AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "s" });
    const moderation = registry.getModerationProvider();
    expect(moderation.name).toBe("local-moderation");
    expect(await moderation.detectPublicFigure?.(new Uint8Array())).toMatchObject({ isPublicFigure: true });
  });

  it("resolves the provider of an existing job even after the default changed", () => {
    setEnv({ AI_PROVIDER: "mock", FAL_KEY: "old-fal-key" });
    expect(registry.getImageProvider().name).toBe("mock");
    expect(registry.getAIProvider("fal")).toMatchObject({ name: "fal", opts: { apiKey: "old-fal-key" } });
    expect(() => registry.getAIProvider("replicate")).toThrow(/REPLICATE_API_TOKEN is not configured/);
  });

  it("applies overrides and clears them with null", () => {
    const face = { name: "test-face", matchThreshold: 0.5, analyze: vi.fn() } as unknown as FaceProvider;
    const image = { name: "mock" } as unknown as ImageProvider;
    const moderation = { name: "test-mod" } as unknown as ModerationProvider;
    const store = { name: "s3" } as unknown as StorageProvider;
    registry.setProviderOverrides({ face, image, moderation, storage: store });
    expect(registry.getFaceProvider()).toBe(face);
    expect(registry.getImageProvider()).toBe(image);
    expect(registry.getAIProvider("mock")).toBe(image);
    expect(registry.getModerationProvider()).toBe(moderation);
    expect(registry.getStorageProvider()).toBe(store);
    // Not overridden → still from env.
    expect(registry.getTrainingProvider()).not.toBe(image);
    expect(registry.getTrainingProvider().name).toBe("mock");

    registry.setProviderOverrides(null);
    expect(registry.getFaceProvider()).not.toBe(face);
    expect(registry.getFaceProvider().name).toBe("mock");
    expect(registry.getStorageProvider()).toBe(storage);
  });

  it("refuses mock safety providers with a real AI provider (env invariant)", () => {
    setEnv({ AI_PROVIDER: "fal", FAL_KEY: "k", FACE_PROVIDER: "mock", MODERATION_PROVIDER: "local" });
    expect(() => getEnv()).toThrow(/Safety: FACE_PROVIDER and MODERATION_PROVIDER cannot be 'mock'/);
    expect(() => registry.getImageProvider()).toThrow(/Safety/);

    setEnv({ AI_PROVIDER: "replicate", REPLICATE_API_TOKEN: "t", REPLICATE_OWNER: "o", FACE_PROVIDER: "local", MODERATION_PROVIDER: "mock" });
    expect(() => registry.getModerationProvider()).toThrow(/Safety/);

    setEnv({ AI_PROVIDER: "replicate", REPLICATE_API_TOKEN: "t", REPLICATE_OWNER: "o", FACE_PROVIDER: "local", MODERATION_PROVIDER: "local" });
    expect(registry.getImageProvider()).toMatchObject({ name: "replicate", opts: { apiToken: "t", owner: "o" } });
  });
});
