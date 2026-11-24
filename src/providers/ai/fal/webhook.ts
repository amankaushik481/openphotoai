/**
 * fal webhook verification (ED25519) and normalization, per docs/MODELS.md §A.1:
 *   headers  X-Fal-Webhook-Request-Id / -User-Id / -Timestamp (unix s) / -Signature (hex, 64 bytes)
 *   message  request_id + "\n" + user_id + "\n" + timestamp + "\n" + hex(sha256(rawBody))
 *   keys     JWKS (OKP / Ed25519) from https://rest.fal.ai/.well-known/jwks.json, cached up to 24 h
 *   window   timestamp within ±5 minutes
 */
import crypto, { type KeyObject } from "node:crypto";
import { z } from "zod";
import type { AIWebhookEvent, ProviderJobStatus, WebhookRequest } from "@/providers/types";
import { WebhookVerificationError } from "@/providers/ai/shared/errors";
import { detailText, isRetryableFailureText } from "./client";
import { completedStatus } from "./normalize";

export const FAL_JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
const JWKS_TTL_MS = 24 * 3600_000;
/** After a failed verification, refetch the JWKS (key rotation) only if the cached copy is older than this. */
const JWKS_MIN_REFRESH_MS = 60_000;
const JWKS_FETCH_TIMEOUT_MS = 5_000;
const MAX_SKEW_SEC = 5 * 60;

export interface JwksCache {
  getKeys(force?: boolean): Promise<KeyObject[]>;
  /** ms timestamp of the last successful fetch, or null. */
  fetchedAt(): number | null;
}

export function createJwksCache(opts: { fetch: typeof fetch; now: () => number; url?: string }): JwksCache {
  let cache: { keys: KeyObject[]; at: number } | null = null;
  let inflight: Promise<KeyObject[]> | null = null;

  async function load(): Promise<KeyObject[]> {
    const res = await opts.fetch(opts.url ?? FAL_JWKS_URL, { signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { keys?: unknown };
    const keys = (Array.isArray(body.keys) ? body.keys : [])
      .filter((k): k is { kty: string; crv: string; x: string } => {
        const j = k as { kty?: unknown; crv?: unknown; x?: unknown };
        return j.kty === "OKP" && j.crv === "Ed25519" && typeof j.x === "string" && j.x.length > 0;
      })
      .flatMap((k) => {
        try {
          return [crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: k.x }, format: "jwk" })];
        } catch {
          return [];
        }
      });
    if (!keys.length) throw new Error("no Ed25519 keys in JWKS");
    cache = { keys, at: opts.now() };
    return keys;
  }

  return {
    async getKeys(force = false) {
      if (!force && cache && opts.now() - cache.at < JWKS_TTL_MS) return cache.keys;
      inflight ??= load().finally(() => {
        inflight = null;
      });
      try {
        return await inflight;
      } catch (err) {
        // A stale key set beats rejecting every webhook while fal's JWKS endpoint is unreachable.
        if (cache) return cache.keys;
        throw new WebhookVerificationError(`Could not load fal webhook keys: ${(err as Error).message}`);
      }
    },
    fetchedAt: () => cache?.at ?? null,
  };
}

export interface VerifiedFalHeaders {
  requestId: string;
  userId: string;
  timestamp: string;
}

/** Verify the ED25519 signature over the raw body. Throws WebhookVerificationError when invalid. */
export async function verifyFalWebhookSignature(
  rawBody: string,
  headers: Headers,
  deps: { jwks: JwksCache; now: () => number },
): Promise<VerifiedFalHeaders> {
  const requestId = headers.get("x-fal-webhook-request-id");
  const userId = headers.get("x-fal-webhook-user-id");
  const timestamp = headers.get("x-fal-webhook-timestamp");
  const signature = headers.get("x-fal-webhook-signature");
  if (!requestId || !userId || !timestamp || !signature) {
    throw new WebhookVerificationError("Missing fal webhook signature headers.");
  }
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(deps.now() / 1000 - Number(timestamp)) > MAX_SKEW_SEC) {
    throw new WebhookVerificationError("fal webhook timestamp is outside the allowed window.");
  }
  if (!/^[0-9a-f]{128}$/i.test(signature)) {
    throw new WebhookVerificationError("Malformed fal webhook signature.");
  }

  const bodyHash = crypto.createHash("sha256").update(Buffer.from(rawBody, "utf8")).digest("hex");
  const message = Buffer.from([requestId, userId, timestamp, bodyHash].join("\n"), "utf8");
  const sig = Buffer.from(signature, "hex");
  const matches = (keys: KeyObject[]) => keys.some((k) => crypto.verify(null, message, k, sig));

  if (matches(await deps.jwks.getKeys())) return { requestId, userId, timestamp };
  const fetchedAt = deps.jwks.fetchedAt();
  if (fetchedAt === null || deps.now() - fetchedAt >= JWKS_MIN_REFRESH_MS) {
    if (matches(await deps.jwks.getKeys(true))) return { requestId, userId, timestamp };
  }
  throw new WebhookVerificationError("Invalid fal webhook signature.");
}

const webhookBody = z.object({
  request_id: z.string().min(1),
  gateway_request_id: z.string().nullish(),
  status: z.enum(["OK", "ERROR"]),
  payload: z.unknown().optional(),
  error: z.string().nullish(),
  payload_error: z.string().nullish(),
});

/** Verify + normalize a fal webhook into an AIWebhookEvent. */
export async function parseFalWebhook(
  req: WebhookRequest,
  deps: { jwks: JwksCache; now: () => number },
): Promise<AIWebhookEvent> {
  const verified = await verifyFalWebhookSignature(req.rawBody, req.headers, deps);

  let json: unknown;
  try {
    json = JSON.parse(req.rawBody);
  } catch {
    throw new WebhookVerificationError("fal webhook body is not valid JSON.");
  }
  const parsed = webhookBody.safeParse(json);
  if (!parsed.success) throw new WebhookVerificationError("Unexpected fal webhook payload.");
  const body = parsed.data;
  if (verified.requestId !== body.request_id && verified.requestId !== body.gateway_request_id) {
    throw new WebhookVerificationError("fal webhook request id does not match its signature.");
  }

  return {
    eventId: `${body.request_id}:${body.status}`,
    requestId: body.request_id,
    ...webhookStatus(body),
  };
}

function webhookStatus(body: z.infer<typeof webhookBody>): { status?: ProviderJobStatus } {
  if (body.status === "ERROR") {
    const parts = [body.error?.trim(), detailText(body.payload)].filter((p): p is string => Boolean(p));
    const error = (parts.length ? parts.join(": ") : "The fal request failed.").slice(0, 500);
    return { status: { state: "failed", error, retryable: isRetryableFailureText(error) } };
  }
  // payload is null when fal could not serialize the output (payload_error): let the engine poll the result.
  if (body.payload === null || body.payload === undefined) return {};
  return { status: completedStatus(body.payload) };
}
