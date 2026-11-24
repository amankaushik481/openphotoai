/** Small helpers shared by the job engine modules. */
import { AppError } from "@/server/http";
import type { ApiErrorCode } from "@/types/domain";

/** True for a Postgres unique-constraint violation (also when wrapped by drizzle's DrizzleQueryError). */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 5; depth++) {
    if (typeof e === "object" && "code" in e && (e as { code?: unknown }).code === "23505") return true;
    e = typeof e === "object" && "cause" in e ? (e as { cause?: unknown }).cause : undefined;
  }
  return false;
}

/** Map with bounded concurrency; results keep input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * An error retrying can't fix (bad provider output, invalid data...). Completion handlers throw it
 * (or any error with `retryable: false`) so the engine fails + refunds the job right away instead of
 * retrying the completion.
 */
export class NonRetryableError extends Error {
  readonly retryable = false;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NonRetryableError";
  }
}

/** AppError codes that describe a transient condition (worth another completion attempt). */
const TRANSIENT_APP_ERROR_CODES: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>(["rate_limited", "provider_error"]);

/**
 * True when a completion failure is deterministic: anything flagged `retryable: false`
 * (NonRetryableError, ProviderRequestError for invalid input...) and AppErrors other than transient
 * ones. An explicit `retryable: true` always wins. Plain errors (network, storage...) are retryable.
 */
export function isNonRetryable(err: unknown): boolean {
  if (err && typeof err === "object" && "retryable" in err) {
    const flag = (err as { retryable?: unknown }).retryable;
    if (flag === false) return true;
    if (flag === true) return false;
  }
  return err instanceof AppError && !TRANSIENT_APP_ERROR_CODES.has(err.code);
}
