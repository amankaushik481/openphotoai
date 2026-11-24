/**
 * Provider adapter interfaces.
 * CONTRACT FILE — see docs/CONTRACTS.md and docs/ADDING_PROVIDERS.md.
 *
 * Every external dependency (AI, payments, email, storage, safety) sits behind one
 * of these interfaces. `src/providers/registry.ts` picks the implementation from env.
 * Mock implementations live in `src/providers/mock/*` and make the whole app work
 * with zero keys (MOCK_PROVIDERS=true).
 */
import type { AIProviderName, AspectRatio, PaymentProviderName, PlanId, Subject, SubscriptionStatus } from "@/types/domain";

/* ════════════════════════════ AI (async, queue-based) ════════════════════════════ */

/** Pointer to a job running at the provider. Persisted on the `jobs` row. */
export interface ProviderJobRef {
  provider: AIProviderName;
  /** Model/endpoint id from src/config/models.ts, e.g. "fal-ai/flux-lora". */
  endpoint: string;
  requestId: string;
}

export interface ProviderImage {
  url: string;
  width?: number;
  height?: number;
  contentType?: string;
  /** Provider-side safety checker verdict, when exposed (fal `has_nsfw_concepts`). */
  nsfw?: boolean;
  seed?: number;
}

export interface ProviderVideo {
  url: string;
  durationSec?: number;
  contentType?: string;
}

export interface ProviderOutput {
  images?: ProviderImage[];
  videos?: ProviderVideo[];
  audio?: { url: string; durationSec?: number }[];
  /** Training: provider-specific reference to the trained identity (LoRA URL, Replicate version...). */
  modelRef?: string;
  text?: string;
  seed?: number;
  /** Raw provider payload, kept for debugging (never shown to users). */
  raw?: unknown;
}

export type ProviderJobStatus =
  | { state: "queued"; position?: number }
  | { state: "running"; progress?: number; logs?: string[] }
  | { state: "succeeded"; output: ProviderOutput }
  | { state: "failed"; error: string; retryable?: boolean }
  | { state: "canceled" };

export interface SubmitOptions {
  /** Public URL the provider calls on completion. Omitted on localhost (polling only). */
  webhookUrl?: string;
}

/** Verified + normalized inbound AI webhook. */
export interface AIWebhookEvent {
  /** Unique id for idempotency (provider request id + status, or provider event id). */
  eventId: string;
  requestId: string;
  /** If the webhook carries the final result, it is included; otherwise the engine polls getStatus(). */
  status?: ProviderJobStatus;
}

export interface WebhookRequest {
  headers: Headers;
  rawBody: string;
  url: string;
}

/** Image/video input passed to providers. Always a URL the provider can fetch. */
export type InputUrl = string;

export interface AsyncAIProvider {
  readonly name: AIProviderName;
  getStatus(ref: ProviderJobRef): Promise<ProviderJobStatus>;
  cancel(ref: ProviderJobRef): Promise<void>;
  /** Verifies the signature and normalizes the payload. Throws on an invalid signature. */
  parseWebhook(req: WebhookRequest): Promise<AIWebhookEvent>;
  /**
   * Make bytes reachable by the provider (e.g. fal storage upload). Used when our own
   * storage is not publicly reachable (local driver). Returns a fetchable URL.
   */
  uploadInput(bytes: Uint8Array, contentType: string, filename?: string): Promise<InputUrl>;
  /** Download an output URL returned by this provider (mock providers synthesize bytes). */
  fetchOutput(url: string): Promise<{ bytes: Uint8Array; contentType: string }>;
}

/* ─────────────── Training ─────────────── */

export interface TrainingInput {
  /** URL of a zip containing the accepted training photos (already EXIF-stripped). */
  imagesZipUrl: InputUrl;
  imageCount: number;
  triggerWord: string;
  subject: Subject;
  /** Optional override; adapters pick sensible defaults from src/config/models.ts. */
  steps?: number;
}

export interface TrainingProvider extends AsyncAIProvider {
  submitTraining(input: TrainingInput, opts?: SubmitOptions): Promise<ProviderJobRef>;
  /** Delete provider-side artifacts for a trained model (LoRA file / destination model version). */
  deleteModel(modelRef: string): Promise<void>;
}

/* ─────────────── Images ─────────────── */

export interface IdentityRef {
  /** Provider model reference from training (LoRA URL / version). */
  modelRef: string;
  triggerWord: string;
  subject: Subject;
  /** Optional reference photos of this identity (for reference-based models / multi-person). */
  referenceImageUrls?: InputUrl[];
}

export interface GenerateInput {
  /** Final prompt. Must already contain the identity trigger word. */
  prompt: string;
  negativePrompt?: string;
  identity: IdentityRef;
  aspectRatio: AspectRatio;
  numImages: number;
  quality: "draft" | "standard" | "high";
  seed?: number;
  /** Optional style/composition reference image. */
  referenceImageUrl?: InputUrl;
  /** 0..1 how strongly to follow the reference image. */
  referenceStrength?: number;
}

export interface EditInput {
  /**
   * instruct: change outfit/background/hair/expression of `imageUrls[0]` following `prompt`.
   * pose_copy: put `identity` into the pose/setting of `imageUrls[0]`.
   * multi_person: compose the identities in `identities` into one scene described by `prompt`.
   */
  mode: "instruct" | "pose_copy" | "multi_person";
  prompt: string;
  imageUrls: InputUrl[];
  identity?: IdentityRef;
  identities?: IdentityRef[];
  aspectRatio?: AspectRatio;
  numImages: number;
  seed?: number;
}

export interface InpaintInput {
  imageUrl: InputUrl;
  /** White = repaint. */
  maskUrl: InputUrl;
  prompt: string;
  identity?: IdentityRef;
}

export interface UpscaleInput {
  imageUrl: InputUrl;
  scale: 2 | 4;
  faceRestore: boolean;
}

export interface TryOnInput {
  personImageUrl: InputUrl;
  garmentImageUrl: InputUrl;
  category: "auto" | "tops" | "bottoms" | "one-pieces";
}

export interface PromptHelperInput {
  /** Plain-language request, e.g. "me on a yacht at sunset looking rich". */
  request: string;
  subject: Subject;
  /** Optional pack/style context. */
  style?: string;
}

export interface PromptHelperResult {
  prompt: string;
  negativePrompt?: string;
  suggestions?: string[];
}

export interface ImageProvider extends AsyncAIProvider {
  submitGenerate(input: GenerateInput, opts?: SubmitOptions): Promise<ProviderJobRef>;
  submitEdit(input: EditInput, opts?: SubmitOptions): Promise<ProviderJobRef>;
  submitInpaint(input: InpaintInput, opts?: SubmitOptions): Promise<ProviderJobRef>;
  submitUpscale(input: UpscaleInput, opts?: SubmitOptions): Promise<ProviderJobRef>;
  submitFaceRestore(input: { imageUrl: InputUrl }, opts?: SubmitOptions): Promise<ProviderJobRef>;
  submitRemoveBackground(input: { imageUrl: InputUrl }, opts?: SubmitOptions): Promise<ProviderJobRef>;
  submitTryOn(input: TryOnInput, opts?: SubmitOptions): Promise<ProviderJobRef>;
  /** Synchronous (fast) LLM call that turns a plain-language request into an optimized prompt. */
  promptHelper(input: PromptHelperInput): Promise<PromptHelperResult>;
}

/* ─────────────── Video ─────────────── */

export interface ImageToVideoInput {
  imageUrl: InputUrl;
  prompt: string;
  durationSec: 5 | 10;
  aspectRatio?: AspectRatio;
}

export interface TalkingVideoInput {
  imageUrl: InputUrl;
  script: string;
  voice: string;
  /**
   * Longest speech audio (seconds) the job paid for. Providers that report the TTS duration must
   * refuse (non-retryable) to animate longer audio: the avatar step is billed per second.
   */
  maxAudioSeconds?: number;
}

export interface VideoProvider extends AsyncAIProvider {
  submitImageToVideo(input: ImageToVideoInput, opts?: SubmitOptions): Promise<ProviderJobRef>;
  submitTalkingVideo(input: TalkingVideoInput, opts?: SubmitOptions): Promise<ProviderJobRef>;
}

/* ════════════════════════════ Safety ════════════════════════════ */

export interface ModerationResult {
  allowed: boolean;
  /** e.g. ["sexual", "minors", "violence", "public_figure"]. */
  categories: string[];
  scores?: Record<string, number>;
  reason?: string;
  provider: string;
}

/** Text + image content classifier. The safety module ALWAYS runs it; it cannot be disabled by env. */
export interface ModerationProvider {
  readonly name: string;
  checkText(text: string): Promise<ModerationResult>;
  checkImage(bytes: Uint8Array): Promise<ModerationResult>;
  /** Optional: detect well-known public figures in an image (e.g. AWS RecognizeCelebrities). */
  detectPublicFigure?(bytes: Uint8Array): Promise<{ isPublicFigure: boolean; name?: string; confidence?: number }>;
}

export interface DetectedFace {
  box: { x: number; y: number; width: number; height: number };
  /** 0..1 detection confidence. */
  confidence: number;
  /** L2-normalized face embedding. Compare with cosine similarity. */
  embedding: number[];
  /** Estimated age in years. */
  age?: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
}

export interface FaceProvider {
  readonly name: string;
  /** Cosine-similarity threshold above which two embeddings are the same person. */
  readonly matchThreshold: number;
  analyze(bytes: Uint8Array): Promise<{ faces: DetectedFace[]; width: number; height: number }>;
}

/* ════════════════════════════ Payments ════════════════════════════ */

export type CheckoutItem =
  | { type: "plan"; planId: Exclude<PlanId, "free">; interval: "month" | "year" }
  | { type: "credit_pack"; packId: string };

export interface CheckoutInput {
  userId: string;
  email: string;
  customerId?: string | null;
  item: CheckoutItem;
  successUrl: string;
  cancelUrl: string;
}

export interface NormalizedSubscription {
  subscriptionId: string;
  customerId: string;
  userId?: string;
  planId: Exclude<PlanId, "free">;
  interval: "month" | "year";
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** Provider-agnostic payment events. Every event carries a unique id + creation time. */
export type PaymentEvent =
  | {
      type: "checkout.completed";
      eventId: string;
      createdAt: Date;
      userId: string;
      customerId: string | null;
      mode: "payment" | "subscription";
      checkoutId: string;
      creditPackId?: string;
      planId?: Exclude<PlanId, "free">;
      interval?: "month" | "year";
      subscriptionId?: string;
      amountCents: number;
      currency: string;
    }
  | { type: "subscription.updated"; eventId: string; createdAt: Date; subscription: NormalizedSubscription }
  | { type: "subscription.deleted"; eventId: string; createdAt: Date; subscription: NormalizedSubscription }
  | {
      type: "invoice.paid";
      eventId: string;
      createdAt: Date;
      invoiceId: string;
      subscriptionId: string;
      customerId: string;
      amountCents: number;
      currency: string;
      /** e.g. "subscription_create" | "subscription_cycle" | "subscription_update". */
      billingReason: string;
      planId?: Exclude<PlanId, "free">;
      interval?: "month" | "year";
      userId?: string;
      /**
       * Invoice total after discounts, before any customer balance was applied. 0 for trials and
       * 100%-off coupons (no credits are granted for those). Defaults to `amountCents`.
       */
      totalCents?: number;
    }
  | {
      type: "invoice.payment_failed";
      eventId: string;
      createdAt: Date;
      invoiceId: string;
      subscriptionId: string;
      customerId: string;
    }
  | {
      type: "payment.refunded";
      eventId: string;
      createdAt: Date;
      /** The checkout/invoice id originally recorded in `payments.providerPaymentId`. */
      paymentId: string;
      amountRefundedCents: number;
      fullyRefunded: boolean;
      /** The subscription a refunded invoice belongs to (a full refund ends it). */
      subscriptionId?: string;
    }
  | {
      /** A chargeback / dispute was opened on a payment (Stripe `charge.dispute.created`). */
      type: "payment.disputed";
      eventId: string;
      createdAt: Date;
      /** The checkout/invoice id originally recorded in `payments.providerPaymentId`. */
      paymentId: string;
      disputeId: string;
      amountCents: number;
      reason?: string;
      /** The subscription a disputed invoice belongs to (it is ended). */
      subscriptionId?: string;
    }
  | {
      /** A dispute was closed (Stripe `charge.dispute.closed`). `won`: the money stays with us. */
      type: "payment.dispute_closed";
      eventId: string;
      createdAt: Date;
      paymentId: string;
      disputeId: string;
      won: boolean;
      status: string;
    }
  | { type: "ignored"; eventId: string; createdAt: Date; rawType: string };

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createCheckout(input: CheckoutInput): Promise<{ url: string; checkoutId: string }>;
  createPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  /** Verifies the signature (throws if invalid) and normalizes the event. */
  parseWebhook(req: WebhookRequest): Promise<PaymentEvent>;
  getSubscription(subscriptionId: string): Promise<NormalizedSubscription | null>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}

/* ════════════════════════════ Email ════════════════════════════ */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: Record<string, string>;
}

export interface EmailProvider {
  readonly name: "resend" | "mock";
  send(msg: EmailMessage): Promise<{ id: string }>;
}

/* ════════════════════════════ Storage ════════════════════════════ */

export interface PutOptions {
  contentType: string;
  cacheControl?: string;
}

export interface StorageProvider {
  readonly name: "local" | "s3";
  /** True when signed URLs are reachable from the public internet (providers can fetch them). */
  readonly publiclyReachable: boolean;
  put(key: string, body: Uint8Array, opts: PutOptions): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Delete every object under a prefix (used for real account/model deletion). */
  deletePrefix(prefix: string): Promise<number>;
  /** Time-limited URL to read an object (browser display, provider input, downloads). */
  getSignedUrl(key: string, opts?: { expiresInSec?: number; downloadName?: string }): Promise<string>;
}
