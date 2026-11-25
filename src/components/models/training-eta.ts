/** Time-left estimate for model training (pure; unit-tested). */
import type { JobDTO } from "@/types/domain";

/** What training typically takes on the default provider (shown before progress is meaningful). */
export const TYPICAL_TRAINING_MINUTES = 20;
/** Past this, say it's slower than usual (the email still comes). */
const SLOW_AFTER_MINUTES = 35;

export interface TrainingEta {
  /** Whole minutes since the job started. */
  elapsedMinutes: number;
  /** Estimated whole minutes left (null once done or when it's running late). */
  remainingMinutes: number | null;
  /** "About 14 minutes left", "Almost done…", "Taking longer than usual". */
  label: string;
}

const minutes = (n: number) => `${n} ${n === 1 ? "minute" : "minutes"}`;

/**
 * Blend the typical duration with what the progress so far implies: early progress numbers are
 * noisy, so the typical duration dominates until the job is 10–40% done.
 */
export function trainingEta(job: Pick<JobDTO, "createdAt" | "progress" | "status">, nowMs: number = Date.now()): TrainingEta {
  const started = Date.parse(job.createdAt);
  const elapsedMs = Number.isFinite(started) ? Math.max(0, nowMs - started) : 0;
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  const progress = Math.min(100, Math.max(0, job.progress || 0));

  if (job.status === "succeeded") return { elapsedMinutes, remainingMinutes: null, label: "Done" };
  if (job.status !== "queued" && job.status !== "running") return { elapsedMinutes, remainingMinutes: null, label: "Stopped" };
  if (progress >= 95) return { elapsedMinutes, remainingMinutes: 0, label: "Almost done…" };

  const typicalLeft = TYPICAL_TRAINING_MINUTES - elapsedMs / 60_000;
  // Below 10% the projection is mostly noise; from 10% to 40% it takes over from the typical duration.
  const weight = Math.min(1, Math.max(0, (progress - 10) / 30));
  const projectedLeft = progress > 0 ? ((elapsedMs / 60_000) * (100 - progress)) / progress : typicalLeft;
  const left = weight * projectedLeft + (1 - weight) * typicalLeft;

  if (left < 1) {
    return elapsedMinutes >= SLOW_AFTER_MINUTES
      ? { elapsedMinutes, remainingMinutes: null, label: "Taking longer than usual" }
      : { elapsedMinutes, remainingMinutes: 1, label: "Any minute now" };
  }
  const remaining = Math.ceil(left);
  return {
    elapsedMinutes,
    remainingMinutes: remaining,
    label: remaining <= 1 ? "About a minute left" : `About ${minutes(remaining)} left`,
  };
}
