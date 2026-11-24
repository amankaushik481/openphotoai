/**
 * Lazy fal client + error mapping. The SDK is imported on first use so `createFalProvider()` stays cheap,
 * and each provider gets its own client instance (no global `fal.config`), which keeps tests mockable.
 */
import type { FalClient } from "@fal-ai/client";
import { isRetryableStatus, ProviderRequestError } from "@/providers/ai/shared/errors";

export type FalClientLoader = () => Promise<FalClient>;

export function createFalClientLoader(apiKey: string): FalClientLoader {
  let pending: Promise<FalClient> | null = null;
  return () => {
    pending ??= import("@fal-ai/client")
      .then(({ createFalClient }) => createFalClient({ credentials: apiKey }))
      .catch((err: unknown) => {
        pending = null;
        throw err;
      });
    return pending;
  };
}

export interface FalErrorInfo {
  message: string;
  /** HTTP status when fal answered; undefined for network/transport failures. */
  status?: number;
  retryable: boolean;
}

interface FalErrorLike {
  status?: unknown;
  message?: unknown;
  body?: unknown;
}

/** Turn an SDK error (ApiError / ValidationError / network error) into a readable, credential-free summary. */
export function describeFalError(err: unknown): FalErrorInfo {
  const e = (typeof err === "object" && err !== null ? err : {}) as FalErrorLike;
  const status = typeof e.status === "number" ? e.status : undefined;
  const detail = detailText(e.body);
  const base = typeof e.message === "string" && e.message ? e.message : String(err);

  if (status === undefined) {
    return { message: `Could not reach fal: ${base}`, retryable: true };
  }
  if (status === 422) {
    return { message: `fal rejected the input: ${detail ?? base}`, status, retryable: false };
  }
  if (status === 401 || status === 403) {
    return { message: "fal refused the request: the API key is missing, invalid or lacks access.", status, retryable: false };
  }
  return {
    message: `fal request failed (HTTP ${status}): ${detail ?? base}`,
    status,
    retryable: isRetryableStatus(status),
  };
}

export function toProviderError(err: unknown, endpoint: string): ProviderRequestError {
  if (err instanceof ProviderRequestError) return err;
  const info = describeFalError(err);
  return new ProviderRequestError({
    provider: "fal",
    endpoint,
    message: info.message,
    status: info.status,
    retryable: info.retryable,
    cause: err,
  });
}

/** Readable text from fal error bodies: `{detail: string}` or Pydantic-style `{detail: [{loc, msg}]}`. */
export function detailText(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return typeof body === "string" && body ? body.slice(0, 500) : undefined;
  const b = body as { detail?: unknown; message?: unknown; error?: unknown };
  if (typeof b.detail === "string") return b.detail.slice(0, 500);
  if (Array.isArray(b.detail)) {
    const parts = b.detail
      .map((d: unknown) => {
        if (!d || typeof d !== "object") return typeof d === "string" ? d : "";
        const item = d as { loc?: unknown; msg?: unknown };
        const loc = Array.isArray(item.loc) ? item.loc.filter((p) => p !== "body").join(".") : "";
        const msg = typeof item.msg === "string" ? item.msg : "";
        return loc ? `${loc}: ${msg}` : msg;
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ").slice(0, 500);
  }
  if (typeof b.message === "string" && b.message) return b.message.slice(0, 500);
  if (typeof b.error === "string" && b.error) return b.error.slice(0, 500);
  return undefined;
}

const TRANSIENT_TEXT = /timed? ?out|timeout|unavailable|overloaded|capacity|disconnected|try again|rate.?limit|internal (server )?error|temporar/i;
const PERMANENT_TEXT = /invalid|validation|unprocessable|not allowed|policy|safety|nsfw|moderation|blocked|forbidden|unsupported|too (large|long|many)/i;

/** Retry heuristic for failures fal reports as free text (webhook ERROR payloads, completed-with-error status). */
export function isRetryableFailureText(text: string): boolean {
  if (PERMANENT_TEXT.test(text)) return false;
  return TRANSIENT_TEXT.test(text);
}
