"use client";

import * as React from "react";
import Link from "next/link";
import { ClockIcon, LayersIcon, MailIcon, RotateCcwIcon, ScanFaceIcon, SparklesIcon } from "lucide-react";

import { JobProgress } from "@/components/app/job-progress";
import { Button } from "@/components/ui/button";
import { useJob } from "@/hooks/use-job";
import { useMe } from "@/hooks/use-me";
import type { JobDTO } from "@/types/domain";
import { trainingEta } from "./training-eta";
import { useNow } from "./use-now";

export interface TrainingProgressProps {
  jobId: string;
  fallbackJob?: JobDTO;
  /** Fires once when the training job finishes (any terminal status). */
  onFinished?: (job: JobDTO) => void;
  /** Offered after a failure (credits are refunded automatically). */
  onRetry?: () => void;
}

/** Live training progress (polls the job until it ends), an ETA, and what to do meanwhile. */
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
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 text-center">
      {!failed && (
        <div aria-hidden="true" className="relative flex size-28 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-brand-gradient opacity-25 motion-safe:animate-ping" />
          <span className="relative flex size-20 items-center justify-center rounded-full bg-brand-gradient text-white shadow-lg">
            <SparklesIcon className="size-9" />
          </span>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-3xl">{failed ? "Training didn't finish" : "Training your model"}</h2>
        <p className="text-sm text-muted-foreground sm:text-base">
          {failed
            ? "Nothing was charged: your credits are back. Check your photos and try again."
            : "It's learning your face from your photos. You don't need to keep this page open."}
        </p>
      </div>
      {eta && (
        <p className="flex items-center gap-2 text-sm font-medium">
          <ClockIcon aria-hidden="true" className="size-4 text-primary" />
          {eta.label}
          {eta.elapsedMinutes > 0 && (
            <span className="font-normal text-muted-foreground">
              · started {eta.elapsedMinutes} {eta.elapsedMinutes === 1 ? "minute" : "minutes"} ago
            </span>
          )}
        </p>
      )}
      <JobProgress job={job} title="Model training" className="w-full text-left" />
      {!failed && (
        <div className="flex w-full flex-col gap-3 rounded-xl border bg-card p-4 text-left">
          <p className="flex items-start gap-2 text-sm">
            <MailIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              We&apos;ll email you{user?.email ? <> at <span className="font-medium break-all">{user.email}</span></> : null} as
              soon as it&apos;s ready. You can close this page.
            </span>
          </p>
          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-sm font-medium">While you wait</p>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <LayersIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  <Link href="/app/packs" className="font-medium text-foreground underline-offset-4 hover:underline">
                    Pick a photo pack
                  </Link>{" "}
                  for your first shoot: headshots, dating, travel and more.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ScanFaceIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
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
