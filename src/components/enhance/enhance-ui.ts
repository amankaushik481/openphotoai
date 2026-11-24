/**
 * Pure helpers for the enhance UI (no React): the job request each action sends, whether an action
 * is available for a photo (and why not), the upscale resolution preview, and friendly error text
 * per API error code.
 */
import { creditCost } from "@/config/credits";
import { errorMessage, type Locale } from "@/i18n";
import { ApiClientError } from "@/lib/api-client";
import { API_ERROR_CODES, type ApiErrorCode, type CreateJobRequest, type MediaDTO } from "@/types/domain";
import {
  ALREADY_TRANSPARENT_MESSAGE,
  allowedUpscaleScales,
  isTransparentImage,
  sizeOf,
  upscaleBlock,
  upscaleBlockMessage,
  upscaleTarget,
  VIDEO_NOT_SUPPORTED_MESSAGE,
  type ImageSize,
  type UpscaleScale,
} from "./enhance-rules";

export type EnhanceAction = "upscale" | "face_restore" | "remove_background";

export interface UpscaleOptions {
  scale: UpscaleScale;
  faceRestore: boolean;
}

export const DEFAULT_UPSCALE_OPTIONS: UpscaleOptions = { scale: 2, faceRestore: true };

export const DRAFT_SOURCE_WARNING =
  "This is a quick draft preview. Enhancing works, but for the best result render it in full quality first.";

type MediaLike = Pick<MediaDTO, "kind" | "mimeType" | "width" | "height">;

/** Body of POST /api/jobs for an enhancement of `mediaId`. */
export function enhanceRequest(
  action: EnhanceAction,
  mediaId: string,
  upscale: UpscaleOptions = DEFAULT_UPSCALE_OPTIONS,
): CreateJobRequest {
  switch (action) {
    case "upscale":
      return { type: "upscale", sourceMediaId: mediaId, scale: upscale.scale, faceRestore: upscale.faceRestore };
    case "face_restore":
      return { type: "face_restore", sourceMediaId: mediaId };
    case "remove_background":
      return { type: "remove_background", sourceMediaId: mediaId };
  }
}

/** Credits an enhancement costs (same pricing as the server). */
export function enhanceCost(action: EnhanceAction, upscale: UpscaleOptions = DEFAULT_UPSCALE_OPTIONS): number {
  return creditCost(enhanceRequest(action, "preview", upscale));
}

export interface Availability {
  available: boolean;
  /** Why the action can't run (null when available). */
  reason: string | null;
}

/** Whether `action` can run on this photo, mirroring the server's plan guards. */
export function actionAvailability(media: MediaLike, action: EnhanceAction, scale: UpscaleScale = 2): Availability {
  if (media.kind !== "image") return { available: false, reason: VIDEO_NOT_SUPPORTED_MESSAGE };
  if (action === "remove_background" && isTransparentImage(media.mimeType)) {
    return { available: false, reason: ALREADY_TRANSPARENT_MESSAGE };
  }
  if (action === "upscale") {
    const size = sizeOf(media);
    const block = upscaleBlock(size, scale);
    if (block && size) return { available: false, reason: upscaleBlockMessage(block, size, scale) };
  }
  return { available: true, reason: null };
}

/** Upscale factors offered for this photo (none for videos). */
export function upscaleScalesFor(media: MediaLike): UpscaleScale[] {
  return media.kind === "image" ? allowedUpscaleScales(sizeOf(media)) : [];
}

/** Default factor for the upscale toggle: the first allowed one, else 2× (shown disabled). */
export function preferredUpscaleScale(media: MediaLike): UpscaleScale {
  return upscaleScalesFor(media)[0] ?? 2;
}

export interface UpscalePreview {
  from: ImageSize;
  to: ImageSize;
  /** Result size in megapixels (1 decimal). */
  megapixels: number;
}

/** Source -> result resolution for the upscale card, or null when the source size is unknown. */
export function upscalePreview(media: Pick<MediaDTO, "width" | "height">, scale: UpscaleScale): UpscalePreview | null {
  const from = sizeOf(media);
  if (!from) return null;
  const to = upscaleTarget(from, scale);
  return { from, to, megapixels: megapixels(to) };
}

export function megapixels(size: ImageSize): number {
  return Math.round((size.width * size.height) / 100_000) / 10;
}

/** "2048 × 2560". */
export function formatSize(size: ImageSize): string {
  return `${size.width} × ${size.height}`;
}

export interface EnhanceErrorInfo {
  code: ApiErrorCode | "network";
  message: string;
  /** Offer a "Buy credits" link next to the message. */
  buyCredits: boolean;
}

/** Codes whose server message is specific, safe and more useful than generic copy. */
const SERVER_MESSAGE_CODES: ReadonlySet<ApiErrorCode> = new Set([
  "validation_error",
  "insufficient_credits",
  "rate_limited",
  "plan_limit",
  "conflict",
]);

export const SOURCE_NOT_FOUND_MESSAGE = "We couldn't find this photo. It may have been deleted.";

function isApiErrorCode(code: unknown): code is ApiErrorCode {
  return typeof code === "string" && (API_ERROR_CODES as readonly string[]).includes(code);
}

/** Friendly text for an error thrown by `api()` while starting an enhancement. */
export function enhanceErrorInfo(err: unknown, locale?: Locale): EnhanceErrorInfo {
  const code: ApiErrorCode | "network" =
    err instanceof ApiClientError && (err.code === "network" || isApiErrorCode(err.code)) ? err.code : "internal";
  const serverMessage = err instanceof ApiClientError ? err.message.trim() : "";
  let message: string;
  if (code === "not_found") message = SOURCE_NOT_FOUND_MESSAGE;
  else if (code !== "network" && SERVER_MESSAGE_CODES.has(code) && serverMessage) message = serverMessage;
  else message = errorMessage(code, locale);
  return { code, message, buyCredits: code === "insufficient_credits" };
}

/** Idempotency-Key for POST /api/jobs (a double click never charges twice). */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return `enhance-${c.randomUUID()}`;
  return `enhance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
