/**
 * Provider registry: picks implementations from env. CONTRACT FILE (owner: providers workstream).
 * Implementations are cached per process. Tests can override with `setProviderOverrides()`.
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

export function setProviderOverrides(o: ProviderOverrides | null): void {
  void o;
  throw new Error("not implemented: setProviderOverrides (providers workstream)");
}

export function getImageProvider(): ImageProvider {
  throw new Error("not implemented");
}
export function getTrainingProvider(): TrainingProvider {
  throw new Error("not implemented");
}
export function getVideoProvider(): VideoProvider {
  throw new Error("not implemented");
}
/** Resolve the provider that owns an existing job (webhooks / polling). */
export function getAIProvider(name: AIProviderName): AsyncAIProvider {
  void name;
  throw new Error("not implemented");
}
export function getModerationProvider(): ModerationProvider {
  throw new Error("not implemented");
}
export function getFaceProvider(): FaceProvider {
  throw new Error("not implemented");
}
export function getPaymentProvider(): PaymentProvider {
  throw new Error("not implemented");
}
export function getEmailProvider(): EmailProvider {
  throw new Error("not implemented");
}
export function getStorageProvider(): StorageProvider {
  throw new Error("not implemented");
}
