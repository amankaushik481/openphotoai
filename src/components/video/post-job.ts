/** Client helpers for starting video jobs (POST /api/jobs) and describing failures. */
import { errorMessage } from "@/i18n";
import { ApiClientError, api } from "@/lib/api-client";
import type { ApiErrorCode, CreateJobRequest, JobDTO } from "@/types/domain";

/** Codes whose server message is specific and safe to show as-is (e.g. "script too long"). */
const SPECIFIC_CODES: ReadonlySet<ApiErrorCode> = new Set([
  "validation_error",
  "content_blocked",
  "insufficient_credits",
  "plan_limit",
  "rate_limited",
  "not_found",
  "conflict",
]);

export function jobErrorText(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code !== "network" && SPECIFIC_CODES.has(err.code) && err.message) return err.message;
    return errorMessage(err.code);
  }
  return errorMessage(undefined);
}

function idempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function postJob(body: CreateJobRequest): Promise<JobDTO> {
  const { job } = await api<{ job: JobDTO }>("/api/jobs", {
    method: "POST",
    body,
    headers: { "Idempotency-Key": idempotencyKey() },
  });
  return job;
}
