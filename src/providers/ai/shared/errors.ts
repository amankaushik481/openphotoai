/**
 * Error type shared by AI adapters. Submit methods throw it so the job engine can show a readable
 * message and decide whether a retry makes sense. Messages never contain credentials.
 */
export class ProviderRequestError extends Error {
  readonly provider: string;
  readonly endpoint?: string;
  /** HTTP status from the provider, when there was one. */
  readonly status?: number;
  /** True for transient failures (rate limits, 5xx, network); false for invalid input or policy refusals. */
  readonly retryable: boolean;

  constructor(args: { provider: string; message: string; retryable: boolean; endpoint?: string; status?: number; cause?: unknown }) {
    super(args.message, args.cause === undefined ? undefined : { cause: args.cause });
    this.name = "ProviderRequestError";
    this.provider = args.provider;
    this.endpoint = args.endpoint;
    this.status = args.status;
    this.retryable = args.retryable;
  }
}

/** Status codes worth retrying: timeouts, conflicts, rate limits and server errors. */
export function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true;
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

/** Thrown by webhook parsers when a signature or payload is invalid. Route handlers answer 401/400. */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}
