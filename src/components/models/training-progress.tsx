"use client";

import * as React from "react";
import Link from "next/link";
import { LayersIcon, MailIcon, RotateCcwIcon, ScanFaceIcon } from "lucide-react";

import { JobProgress } from "@/components/app/job-progress";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sprockets, darkroomMotion } from "@/components/ui/darkroom";
import { useJob } from "@/hooks/use-job";
import { useMe } from "@/hooks/use-me";
import type { JobDTO } from "@/types/domain";
import { cn } from "@/lib/utils";
import { TYPICAL_TRAINING_MINUTES, trainingEta } from "./training-eta";
import { useNow } from "./use-now";

/** Seconds as darkroom-timer numerals: 754 → "00:12:34". */
export function timerNumerals(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/**
 * The darkroom timer for a training job: "DEVELOPING" under a breathing safelight lamp, the elapsed time
 * in big mono numerals, the progress as a safelight bar and the ETA. A dark band in both themes.
 */
export function DarkroomTimer({ job, className }: { job: JobDTO | undefined; className?: string }) {
  const inFlight = !job || job.status === "queued" || job.status === "running";
  // The clock ticks every second while developing (display only; polling is unchanged).
  const now = useNow(1000, inFlight);
  const eta = job && inFlight && now !== null ? trainingEta(job, now) : null;
  const started = job ? Date.parse(job.createdAt) : NaN;
  const elapsed = now !== null && Number.isFinite(started) ? (now - started) / 1000 : 0;
  const value = job ? (job.status === "succeeded" ? 100 : Math.max(job.status === "queued" ? 3 : 6, job.progress)) : 3;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xs bg-darkroom px-4 py-3 text-darkroom-foreground shadow-[0_0_60px_-30px_var(--darkroom-safelight)] sm:px-6",
        className,
      )}
    >
      <Sprockets className="text-darkroom-foreground/20" />
      <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 font-mono text-[0.6875rem] tracking-[0.2em] text-darkroom-safelight uppercase">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full bg-darkroom-safelight shadow-[0_0_10px_var(--darkroom-safelight)]",
                inFlight && darkroomMotion.blink,
              )}
            />
            {inFlight ? "Developing" : job?.status === "succeeded" ? "Fixed · ready" : "Stopped"}
          </p>
          {/* Decorative clock: the ETA line below carries the same information in words. */}
          <p aria-hidden="true" className="font-mono text-5xl leading-none font-medium tracking-[-0.04em] tabular-nums sm:text-6xl">
            {timerNumerals(elapsed)}
          </p>
        </div>
        <p className="font-mono text-[0.6875rem] tracking-[0.14em] text-darkroom-muted uppercase sm:text-right">
          {eta ? eta.label : inFlight ? `About ${TYPICAL_TRAINING_MINUTES} minutes` : null}
          <span className="block">Typical · {timerNumerals(TYPICAL_TRAINING_MINUTES * 60)}</span>
        </p>
      </div>
      {/* Visual only: pair it with a <JobProgress> (it announces status and progress to assistive tech). */}
      <Progress
        value={value}
        aria-hidden="true"
        className="mb-4 bg-darkroom-foreground/15"
        indicatorClassName="bg-darkroom-safelight"
      />
      <Sprockets className="text-darkroom-foreground/20" />
    </div>
  );
}

export interface TrainingProgressProps {
  jobId: string;
  fallbackJob?: JobDTO;
  /** Fires once when the training job finishes (any terminal status). */
  onFinished?: (job: JobDTO) => void;
  /** Offered after a failure (credits are refunded automatically). */
  onRetry?: () => void;
}

/** Live training progress (polls the job until it ends), a darkroom timer with the ETA, and what to do meanwhile. */
export function TrainingProgress({ jobId, fallbackJob, onFinished, onRetry }: TrainingProgressProps) {
  const { user, mutate: refreshMe } = useMe();
  const { job } = useJob(jobId, {
    fallbackJob,
    onTerminal: (finished) => {
      // A failed or canceled training is refunded: show the balance it restored.
      void refreshMe();
      onFinished?.(finished);
    },
  });
  const failed = job && (job.status === "failed" || job.status === "canceled" || job.status === "blocked");
  const inFlight = !job || job.status === "queued" || job.status === "running";
  const now = useNow(30_000, inFlight);
  const eta = job && inFlight && now !== null ? trainingEta(job, now) : null;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[2rem] leading-none sm:text-4xl">
          {failed ? "Training didn't finish" : "Training your model"}
        </h2>
        <p className="text-sm text-muted-foreground sm:text-base">
          {failed
            ? "Nothing was charged: your credits are back. Check your photos and try again."
            : "It's learning your face from your photos. You don't need to keep this page open."}
        </p>
        {eta && eta.elapsedMinutes > 0 && (
          <p className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">
            Started {eta.elapsedMinutes} {eta.elapsedMinutes === 1 ? "minute" : "minutes"} ago
          </p>
        )}
      </div>
      {!failed && <DarkroomTimer job={job} />}
      <JobProgress job={job} title="Model training" className={cn("w-full text-left", !failed && "sr-only")} />
      {!failed && (
        <div className="flex w-full flex-col gap-3 border-y border-border py-4 text-left">
          <p className="flex items-start gap-2 text-sm">
            <MailIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-safelight-ink" />
            <span>
              We&apos;ll email you{user?.email ? <> at <span className="font-medium break-all">{user.email}</span></> : null} as
              soon as it&apos;s ready. You can close this page.
            </span>
          </p>
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="mono-caps text-muted-foreground">While you wait</p>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <LayersIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  <Link href="/app/packs" className="font-medium text-foreground underline decoration-foreground/35 underline-offset-4 hover:decoration-safelight-ink">
                    Pick a photo pack
                  </Link>{" "}
                  for your first shoot: headshots, dating, travel and more.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ScanFaceIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>Your photos stay private. You can delete the model and its photos at any time.</span>
              </li>
            </ul>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        {failed && onRetry && (
          <Button type="button" variant="brand" onClick={onRetry}>
            <RotateCcwIcon />
            Try again
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href="/app/models">Back to my models</Link>
        </Button>
      </div>
    </div>
  );
}
