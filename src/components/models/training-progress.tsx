"use client";

import Link from "next/link";
import { MailIcon, RotateCcwIcon, SparklesIcon } from "lucide-react";

import { JobProgress } from "@/components/app/job-progress";
import { Button } from "@/components/ui/button";
import { useJob } from "@/hooks/use-job";
import type { JobDTO } from "@/types/domain";

export interface TrainingProgressProps {
  jobId: string;
  fallbackJob?: JobDTO;
  /** Fires once when the training job finishes (any terminal status). */
  onFinished?: (job: JobDTO) => void;
  /** Offered after a failure (credits are refunded automatically). */
  onRetry?: () => void;
}

/** Live training progress (polls the job until it ends). */
export function TrainingProgress({ jobId, fallbackJob, onFinished, onRetry }: TrainingProgressProps) {
  const { job } = useJob(jobId, { fallbackJob, onTerminal: onFinished });
  const failed = job && (job.status === "failed" || job.status === "canceled" || job.status === "blocked");

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
            : "This usually takes about 20 minutes. You can leave this page: we'll email you as soon as it's ready."}
        </p>
      </div>
      <JobProgress job={job} title="Model training" className="w-full text-left" />
      {!failed && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MailIcon aria-hidden="true" className="size-4" />
          We&apos;ll send a &quot;model ready&quot; email.
        </p>
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
