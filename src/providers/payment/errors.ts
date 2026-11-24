/**
 * Thrown by payment providers' `parseWebhook`. `retryable: false` means the request itself is bad
 * (missing/invalid signature, malformed body → HTTP 400); `retryable: true` means the event was
 * authentic but could not be normalized right now (e.g. a provider API lookup failed → HTTP 500,
 * so the provider redelivers it).
 */
export class PaymentWebhookError extends Error {
  readonly retryable: boolean;
  constructor(message: string, opts: { retryable?: boolean; cause?: unknown } = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "PaymentWebhookError";
    this.retryable = opts.retryable ?? false;
  }
}
