/**
 * Typed fetch helper for client components. CONTRACT FILE.
 * Throws ApiClientError with the server's `{ error: { code, message } }`.
 */
import { t } from "@/i18n";
import type { ApiErrorBody, ApiErrorCode } from "@/types/domain";

export class ApiClientError extends Error {
  readonly code: ApiErrorCode | "network";
  readonly status: number;
  readonly details?: unknown;
  constructor(code: ApiErrorCode | "network", message: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function api<T>(
  path: string,
  init?: Omit<RequestInit, "body"> & { body?: unknown; json?: boolean },
): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body !== undefined && !isForm ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
      body: init?.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiClientError("network", "Network error — check your connection.", 0);
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiClientError(err?.code ?? "internal", err?.message ?? `Request failed (${res.status})`, res.status, err?.details);
  }
  return data as T;
}

/** Text for a failed request: the server's message when there is one, else a generic "try again". */
export function apiErrorText(err: unknown): string {
  if (err instanceof ApiClientError && err.message) return err.message;
  return t("errors.tryAgain");
}

/** SWR fetcher. */
export const fetcher = <T,>(path: string) => api<T>(path);
