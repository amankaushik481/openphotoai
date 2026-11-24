import { createHmac, timingSafeEqual } from "node:crypto";
import type { AIWebhookEvent, WebhookRequest } from "@/providers/types";
import { WebhookVerificationError } from "../shared/errors";
import { encodeRequestId } from "./refs";
import { isTrainingJob, normalizeJob, outputKindFor, type ReplicateJobLike } from "./status";

export const WEBHOOK_TOLERANCE_SEC = 5 * 60;

/**
 * Standard Webhooks verification as used by Replicate: HMAC-SHA256 over `${id}.${timestamp}.${body}`, keyed with the
 * base64-decoded secret after the `whsec_` prefix; `webhook-signature` holds space-separated `v1,<base64>` entries.
 * Throws the shared WebhookVerificationError when anything is missing, stale (±5 min) or does not match.
 */
export function verifyReplicateSignature(
  req: Pick<WebhookRequest, "headers" | "rawBody">,
  secret: string,
  nowMs: number = Date.now(),
): { id: string; timestamp: number } {
  const id = req.headers.get("webhook-id");
  const ts = req.headers.get("webhook-timestamp");
  const signatures = req.headers.get("webhook-signature");
  if (!id || !ts || !signatures) throw new WebhookVerificationError("Missing Replicate webhook signature headers");
  if (!/^\d{1,12}$/.test(ts)) throw new WebhookVerificationError("Invalid Replicate webhook timestamp");
  const timestamp = Number(ts);
  if (Math.abs(nowMs / 1000 - timestamp) > WEBHOOK_TOLERANCE_SEC) {
    throw new WebhookVerificationError("Replicate webhook timestamp outside the tolerance window");
  }

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
  if (key.length === 0) throw new WebhookVerificationError("Replicate webhook secret is empty");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${req.rawBody}`, "utf8").digest();

  const valid = signatures.split(" ").some((entry) => {
    const comma = entry.indexOf(",");
    if (comma === -1 || entry.slice(0, comma) !== "v1") return false;
    const given = Buffer.from(entry.slice(comma + 1), "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!valid) throw new WebhookVerificationError("Invalid Replicate webhook signature");
  return { id, timestamp };
}

/** Verifies and normalizes a Replicate prediction/training webhook. */
export function parseReplicateWebhook(req: WebhookRequest, secret: string | undefined, nowMs?: number): AIWebhookEvent {
  if (!secret) throw new WebhookVerificationError("REPLICATE_WEBHOOK_SECRET is not configured; cannot verify webhooks");
  const { id: eventId } = verifyReplicateSignature(req, secret, nowMs);

  let body: ReplicateJobLike;
  try {
    body = JSON.parse(req.rawBody) as ReplicateJobLike;
  } catch {
    throw new WebhookVerificationError("Replicate webhook body is not valid JSON");
  }
  if (!body || typeof body.id !== "string" || typeof body.status !== "string") {
    throw new WebhookVerificationError("Replicate webhook body is not a prediction or training");
  }

  const modelKind = outputKindFor(body.model ?? "");
  const training = isTrainingJob(body) || modelKind === "training";
  const requestId = encodeRequestId(training ? { kind: "training", id: body.id } : { kind: "prediction", id: body.id });
  return { eventId, requestId, status: normalizeJob(body, training ? "training" : modelKind) };
}
