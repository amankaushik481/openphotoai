"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { JOB_TYPE_LABELS } from "@/config/credits";
import { API_ERROR_CODES, type ApiErrorCode, type JobDTO, type JobStatus } from "@/types/domain";
import { errorMessage } from "@/i18n";
import { useT, type Translator } from "@/i18n/react";
import { cn } from "@/lib/utils";

/** Darkroom words for the two states people watch: a running job is developing, a finished one is ready. */
const DARKROOM_LABEL: Partial<Record<JobStatus, string>> = {
  queued: "In the tray",
  running: "Developing",
  succeeded: "Ready",
};

const STATUS_VARIANT: Record<JobStatus, "secondary" | "soft" | "success" | "destructive" | "outline" | "warning"> = {
  queued: "secondary",
  running: "soft",
  succeeded: "success",
  failed: "destructive",
  canceled: "outline",
  blocked: "warning",
};

/**
 * Lab-label status chip: DEVELOPING with a breathing safelight lamp while running, READY when done,
 * FAILED · REFUNDED when credits came back.
 */
export function JobStatusBadge({
  status,
  refunded = false,
  className,
}: {
  status: JobStatus;
  /** Credits were refunded (adds "· refunded" to a failed / blocked / canceled job). */
  refunded?: boolean;
  className?: string;
}) {
  const t = useT();
  const label = DARKROOM_LABEL[status] ?? t(`jobs.status.${status}`);
  return (
    <Badge variant={STATUS_VARIANT[status]} className={cn("gap-1.5", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full bg-current",
          status === "running" && "motion-safe:animate-pulse",
          status === "queued" && "opacity-50",
        )}
      />
      {label}
      {refunded && status !== "succeeded" ? " · refunded" : null}
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
      <div className={cn(!bare && "rounded-xs border bg-card p-4", "flex flex-col gap-3", className)} aria-busy="true">
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
      className={cn(!bare && "rounded-xs border bg-card p-4", "flex flex-col gap-3", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium">{title ?? JOB_TYPE_LABELS[job.type]}</p>
        <JobStatusBadge status={job.status} refunded={refunded > 0} />
      </div>
      {(inFlight || job.status === "succeeded") && (
        <Progress
          value={value}
          aria-label={t("jobs.progressLabel")}
          className={cn(job.status === "queued" && "animate-pulse")}
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
