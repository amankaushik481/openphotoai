/** Per-photo rows of the batch page (pure; unit-tested). */
import type { CreateJobRequest, JobDTO } from "@/types/domain";

export type BatchItemKind = "waiting" | "running" | "done" | "partial" | "failed" | "blocked" | "canceled";

export interface BatchItemState {
  kind: BatchItemKind;
  /** Short status text ("Making it… 40%", "Failed · 1 credit refunded"). */
  label: string;
  /** Credits given back for this photo (failures, blocks, cancels, low likeness). */
  refunded: number;
  /** A provider failure is worth another try; a safety block or a cancel isn't offered one. */
  canRetry: boolean;
}

function creditsText(n: number): string {
  return n === 1 ? "1 credit" : `${n} credits`;
}

export function batchItemState(job: Pick<JobDTO, "status" | "progress" | "creditsRefunded" | "media" | "input">): BatchItemState {
  const refunded = Math.max(0, job.creditsRefunded || 0);
  const refundText = refunded > 0 ? ` · ${creditsText(refunded)} refunded` : "";
  switch (job.status) {
    case "queued":
      return { kind: "waiting", label: "Waiting to start", refunded, canRetry: false };
    case "running":
      return {
        kind: "running",
        label: `Making it… ${Math.min(99, Math.max(1, Math.round(job.progress || 0)))}%`,
        refunded,
        canRetry: false,
      };
    case "succeeded":
      // Fewer photos than asked: some were blocked by the safety check or refunded for low likeness.
      if (job.media.length === 0) return { kind: "partial", label: `No photo kept${refundText}`, refunded, canRetry: false };
      return refunded > 0
        ? { kind: "partial", label: `Done${refundText}`, refunded, canRetry: false }
        : { kind: "done", label: "Done", refunded, canRetry: false };
    case "blocked":
      return { kind: "blocked", label: `Blocked by the safety check${refundText}`, refunded, canRetry: false };
    case "canceled":
      return { kind: "canceled", label: `Canceled${refundText}`, refunded, canRetry: false };
    case "failed":
      return { kind: "failed", label: `Failed${refundText}`, refunded, canRetry: retryRequest(job) !== null };
  }
}

/** The same pack prompt again (new seed). Only photo generations can be retried from here. */
export function retryRequest(job: Pick<JobDTO, "input">): CreateJobRequest | null {
  if (job.input.type !== "generate") return null;
  const input = { ...job.input };
  delete input.seed;
  return input;
}

/** What a retry costs: what the photo was charged the first time (Instant-model pricing included). */
export function retryCost(jobs: readonly Pick<JobDTO, "creditsCharged">[]): number {
  return jobs.reduce((sum, j) => sum + Math.max(0, j.creditsCharged || 0), 0);
}

/** Pack prompt title for a batch job ("Executive portrait"), or a numbered fallback. */
export function batchItemTitle(job: Pick<JobDTO, "input">, index: number, promptTitles: readonly string[]): string {
  const i = job.input.type === "generate" ? job.input.packPromptIndex : undefined;
  return (i !== undefined ? promptTitles[i] : undefined) ?? `Photo ${index + 1}`;
}

/**
 * Darkroom status for a frame on the batch contact sheet ("DEVELOPING", "PRINTED", "FAILED · REFUNDED"),
 * shown as a mono chip beside the plain-language label, which keeps the details.
 */
export function darkroomStatus(state: Pick<BatchItemState, "kind" | "refunded">): string {
  const refunded = state.refunded > 0 ? " · Refunded" : "";
  switch (state.kind) {
    case "waiting":
      return "Queued";
    case "running":
      return "Developing";
    case "done":
      return "Printed";
    case "partial":
      return `Printed${refunded}`;
    case "failed":
      return `Failed${refunded}`;
    case "blocked":
      return `Blocked${refunded}`;
    case "canceled":
      return `Canceled${refunded}`;
  }
}
