/** Inbound payment webhooks: verify + normalize with the provider, then apply idempotently. */
import { PaymentWebhookError } from "@/providers/payment/errors";
import { getPaymentProvider } from "@/providers/registry";
import type { PaymentEvent, WebhookRequest } from "@/providers/types";
import { errors } from "@/server/http";
import type { PaymentProviderName } from "@/types/domain";
import { applyPaymentEvent, RetryablePaymentEventError } from "./events";

export interface PaymentWebhookResult {
  received: true;
  /** The event was already processed (the provider can stop redelivering). */
  duplicate?: true;
  /** Not an event we act on. */
  ignored?: true;
}

/**
 * Responses: 200 for processed / duplicate / ignored events, 400 for a bad signature or body,
 * 500 when the event must be redelivered (the failure is recorded in webhook_events).
 */
export async function handlePaymentWebhook(provider: PaymentProviderName, req: WebhookRequest): Promise<PaymentWebhookResult> {
  const payment = getPaymentProvider();
  if (payment.name !== provider) throw errors.notFound("Webhook");

  let event: PaymentEvent;
  try {
    event = await payment.parseWebhook(req);
  } catch (err) {
    if (err instanceof PaymentWebhookError && err.retryable) throw new RetryablePaymentEventError(err.message);
    console.warn(`[billing] rejected ${provider} webhook:`, err instanceof Error ? err.message : err);
    throw errors.validation("Invalid webhook signature.");
  }

  const result = await applyPaymentEvent(provider, event);
  if (result.status === "duplicate") return { received: true, duplicate: true };
  if (result.status === "ignored") return { received: true, ignored: true };
  return { received: true };
}
