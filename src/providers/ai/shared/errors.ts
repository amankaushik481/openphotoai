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

/**
 * Text-to-speech produced more audio than the talking video paid for (`maxAudioSeconds`): the
 * per-second avatar step is not started. Not retryable; the job handler shows it as a validation error.
 */
export class AudioTooLongError extends ProviderRequestError {
  readonly audioSeconds: number;
  readonly maxSeconds: number;

  constructor(args: { provider: string; endpoint?: string; audioSeconds: number; maxSeconds: number }) {
    super({
      provider: args.provider,
      endpoint: args.endpoint,
      retryable: false,
      message: `Speech audio is ${args.audioSeconds.toFixed(1)}s, longer than the ${args.maxSeconds}s allowed for this job.`,
    });
    this.name = "AudioTooLongError";
    this.audioSeconds = args.audioSeconds;
    this.maxSeconds = args.maxSeconds;
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

/**
 * The provider has no way to delete a trained model's files (e.g. fal storage). `message` is safe to
 * show to the model's owner: it says what happens to the provider's copy instead.
 */
export class ProviderDeletionUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderDeletionUnsupportedError";
  }
}
