"use client";

import { CircleCheckIcon, CircleXIcon, LoaderCircleIcon, ShieldAlertIcon, ClockIcon, BanIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { JOB_TYPE_LABELS } from "@/config/credits";
import { API_ERROR_CODES, type ApiErrorCode, type JobDTO, type JobStatus } from "@/types/domain";
import { errorMessage } from "@/i18n";
import { useT, type Translator } from "@/i18n/react";
import { cn } from "@/lib/utils";

const STATUS_ICON: Record<JobStatus, typeof ClockIcon> = {
  queued: ClockIcon,
  running: LoaderCircleIcon,
  succeeded: CircleCheckIcon,
  failed: CircleXIcon,
  canceled: BanIcon,
  blocked: ShieldAlertIcon,
};

const STATUS_VARIANT: Record<JobStatus, "secondary" | "soft" | "success" | "destructive" | "outline" | "warning"> = {
  queued: "secondary",
  running: "soft",
  succeeded: "success",
  failed: "destructive",
  canceled: "outline",
  blocked: "warning",
};

export function JobStatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const t = useT();
  const Icon = STATUS_ICON[status];
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      <Icon aria-hidden="true" className={cn(status === "running" && "animate-spin")} />
      {t(`jobs.status.${status}`)}
    </Badge>
  );
}

function isApiErrorCode(code: string | null): code is ApiErrorCode {
  return code !== null && (API_ERROR_CODES as readonly string[]).includes(code);
}

/** User-facing failure text: known codes map to friendly copy; otherwise the engine's message. */
export function friendlyJobError(job: Pick<JobDTO, "status" | "error" | "errorCode">, t: Translator): string | null {
  if (job.status === "blocked") return t("errors.content_blocked");
  if (job.status !== "failed") return null;
  if (isApiErrorCode(job.errorCode) && job.errorCode !== "internal") return errorMessage(job.errorCode, t.locale);
  return job.error || t("jobs.failedGeneric");
}

export interface JobProgressProps {
  job: JobDTO | undefined;
  /** Heading override (defaults to the job type label). */
  title?: string;
  className?: string;
  /** Hide the outer card chrome (for embedding). */
  bare?: boolean;
}

export function JobProgress({ job, title, className, bare = false }: JobProgressProps) {
  const t = useT();

  if (!job) {
    return (
      <div className={cn(!bare && "rounded-xl border bg-card p-4", "flex flex-col gap-3", className)} aria-busy="true">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-2 w-full" />
      </div>
    );
  }

  const inFlight = job.status === "queued" || job.status === "running";
  const value = job.status === "succeeded" ? 100 : inFlight ? Math.max(job.status === "queued" ? 3 : 8, job.progress) : 100;
  const error = friendlyJobError(job, t);
  const refunded = job.creditsRefunded;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(!bare && "rounded-xl border bg-card p-4", "flex flex-col gap-3", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium">{title ?? JOB_TYPE_LABELS[job.type]}</p>
        <JobStatusBadge status={job.status} />
      </div>
      {(inFlight || job.status === "succeeded") && (
        <Progress
          value={value}
          aria-label={t("jobs.progressLabel")}
          className={cn(job.status === "queued" && "animate-pulse")}
          indicatorClassName={cn(inFlight && "bg-brand-gradient")}
        />
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {job.blockedCount > 0 && job.status !== "blocked" && (
        <p className="text-sm text-muted-foreground">{t("jobs.blockedOutputs", { count: job.blockedCount })}</p>
      )}
      {refunded > 0 && (
        <p className="text-sm text-muted-foreground">
          {t.count("credits.refundedNote", "credits.refundedNoteOne", refunded)}
        </p>
      )}
    </div>
  );
}
