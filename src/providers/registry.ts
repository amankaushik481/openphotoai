/**
 * Provider registry: picks implementations from env. CONTRACT FILE (owner: providers workstream).
 * Implementations are cached per process. Tests can override with `setProviderOverrides()`.
 *
 * Factories are cheap (heavy SDKs load lazily inside methods), so importing them here is fine.
 * Safety invariant (real AI ⇒ real face + moderation providers) is enforced by `src/lib/env.ts`.
 */
import type {
  AsyncAIProvider,
  EmailProvider,
  FaceProvider,
  ImageProvider,
  ModerationProvider,
  PaymentProvider,
  StorageProvider,
  TrainingProvider,
  VideoProvider,
} from "./types";
import type { AIProviderName } from "@/types/domain";
import { env } from "@/lib/env";
import { getStorage } from "@/server/storage";
import { createFalProvider } from "./ai/fal";
import { createReplicateProvider } from "./ai/replicate";
import { createMockEmailProvider } from "./email/mock";
import { createResendEmailProvider } from "./email/resend";
import { createMockAIProvider } from "./mock/ai";
import { createMockFaceProvider } from "./mock/face";
import { createMockModerationProvider } from "./mock/moderation";
import { createMockPaymentProvider } from "./payment/mock";
import { createStripePaymentProvider } from "./payment/stripe";
import { createLocalFaceProvider } from "./safety/local-face";
import { createLocalModerationProvider } from "./safety/local-moderation";
import { createOpenAIModerationProvider } from "./safety/openai-moderation";
import { createRekognitionFaceProvider } from "./safety/rekognition";

export interface ProviderOverrides {
  image?: ImageProvider;
  training?: TrainingProvider;
  video?: VideoProvider;
  moderation?: ModerationProvider;
  face?: FaceProvider;
  payment?: PaymentProvider;
  email?: EmailProvider;
  storage?: StorageProvider;
}

type AIProvider = ImageProvider & TrainingProvider & VideoProvider;

let overrides: ProviderOverrides | null = null;
const instances = new Map<string, unknown>();

function cached<T>(key: string, create: () => T): T {
  if (!instances.has(key)) instances.set(key, create());
  return instances.get(key) as T;
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

/**
 * Test hook: replace some providers (the rest still come from env). Replaces any previous
 * overrides; `null` clears them and drops cached instances so env changes take effect.
 */
export function setProviderOverrides(o: ProviderOverrides | null): void {
  overrides = o ? { ...o } : null;
  if (!o) instances.clear();
}

function aiProvider(name: AIProviderName): AIProvider {
  return cached(`ai:${name}`, (): AIProvider => {
    switch (name) {
      case "mock":
        return createMockAIProvider();
      case "fal":
        return createFalProvider({ apiKey: required(env.FAL_KEY, "FAL_KEY") });
      case "replicate":
        return createReplicateProvider({
          apiToken: required(env.REPLICATE_API_TOKEN, "REPLICATE_API_TOKEN"),
          webhookSecret: env.REPLICATE_WEBHOOK_SECRET,
          owner: required(env.REPLICATE_OWNER, "REPLICATE_OWNER"),
        });
      default:
        throw new Error(`Unknown AI provider: ${String(name satisfies never)}`);
    }
  });
}

export function getImageProvider(): ImageProvider {
  return overrides?.image ?? aiProvider(env.aiProvider);
}
export function getTrainingProvider(): TrainingProvider {
  return overrides?.training ?? aiProvider(env.aiProvider);
}
export function getVideoProvider(): VideoProvider {
  return overrides?.video ?? aiProvider(env.aiProvider);
}
/** Resolve the provider that owns an existing job (webhooks / polling), even if the default changed since. */
export function getAIProvider(name: AIProviderName): AsyncAIProvider {
  const overridden = [overrides?.image, overrides?.training, overrides?.video].find((p) => p?.name === name);
  return overridden ?? aiProvider(name);
}
export function getModerationProvider(): ModerationProvider {
  if (overrides?.moderation) return overrides.moderation;
  const name = env.moderationProvider;
  return cached(`moderation:${name}`, (): ModerationProvider => {
    switch (name) {
      case "mock":
        return createMockModerationProvider();
      case "local":
        return createLocalModerationProvider();
      case "openai":
        return createOpenAIModerationProvider({ apiKey: required(env.OPENAI_API_KEY, "OPENAI_API_KEY") });
      default:
        throw new Error(`Unknown moderation provider: ${String(name satisfies never)}`);
    }
  });
}
export function getFaceProvider(): FaceProvider {
  if (overrides?.face) return overrides.face;
  const name = env.faceProvider;
  return cached(`face:${name}`, (): FaceProvider => {
    switch (name) {
      case "mock":
        return createMockFaceProvider();
      case "local":
        return createLocalFaceProvider();
      case "rekognition":
        return createRekognitionFaceProvider({
          region: required(env.AWS_REGION, "AWS_REGION"),
          accessKeyId: required(env.AWS_ACCESS_KEY_ID, "AWS_ACCESS_KEY_ID"),
          secretAccessKey: required(env.AWS_SECRET_ACCESS_KEY, "AWS_SECRET_ACCESS_KEY"),
        });
      default:
        throw new Error(`Unknown face provider: ${String(name satisfies never)}`);
    }
  });
}
export function getPaymentProvider(): PaymentProvider {
  if (overrides?.payment) return overrides.payment;
  const name = env.paymentProvider;
  return cached(`payment:${name}`, (): PaymentProvider => {
    switch (name) {
      case "mock":
        return createMockPaymentProvider();
      case "stripe":
        return createStripePaymentProvider({
          secretKey: required(env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY"),
          webhookSecret: required(env.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET"),
        });
      default:
        throw new Error(`Unknown payment provider: ${String(name satisfies never)}`);
    }
  });
}
export function getEmailProvider(): EmailProvider {
  if (overrides?.email) return overrides.email;
  const name = env.emailProvider;
  return cached(`email:${name}`, (): EmailProvider => {
    switch (name) {
      case "mock":
        return createMockEmailProvider();
      case "resend":
        return createResendEmailProvider({ apiKey: required(env.RESEND_API_KEY, "RESEND_API_KEY"), from: env.EMAIL_FROM });
      default:
        throw new Error(`Unknown email provider: ${String(name satisfies never)}`);
    }
  });
}
export function getStorageProvider(): StorageProvider {
  return overrides?.storage ?? getStorage();
}
