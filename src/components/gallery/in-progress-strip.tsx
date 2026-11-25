"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { CircleAlertIcon, LoaderCircleIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { friendlyJobError } from "@/components/app/job-progress";
import { JOB_TYPE_LABELS } from "@/config/credits";
import { isTerminalStatus } from "@/hooks/job-status";
import { useJobs } from "@/hooks/use-job";
import { fetcher } from "@/lib/api-client";
import { useT } from "@/i18n/react";
import type { JobDTO } from "@/types/domain";
import { inFlightMediaJobs, inProgressLabel, refundNote, summarizeInProgress } from "./in-progress";

/** Recent jobs: anything still in flight is among the newest few. */
const RECENT_JOBS_KEY = "/api/jobs?limit=10";

/**
 * Photos and videos still being made (from any page), with live progress; the gallery refreshes as
 * each job lands. Jobs that fail or are blocked while you watch say so, with their refund.
 */
export function InProgressStrip({ onFinished }: { onFinished: () => void }) {
  const t = useT();
  const { data, mutate } = useSWR<{ jobs: JobDTO[] }>(RECENT_JOBS_KEY, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5_000,
  });
  const liveIds = React.useMemo(() => inFlightMediaJobs(data?.jobs ?? []).map((j) => j.id), [data]);
  const { jobs } = useJobs(liveIds);
  const [ended, setEnded] = React.useState<JobDTO[]>([]);

  // Each job that lands refreshes the gallery; problems stay listed until dismissed.
  const finishedRef = React.useRef(new Set<string>());
  const onFinishedRef = React.useRef(onFinished);
  React.useEffect(() => {
    onFinishedRef.current = onFinished;
  });
  React.useEffect(() => {
    const newlyDone = jobs.filter((j) => isTerminalStatus(j.status) && !finishedRef.current.has(j.id));
    if (!newlyDone.length) return;
    for (const j of newlyDone) finishedRef.current.add(j.id);
    const problems = newlyDone.filter((j) => j.status !== "succeeded" || j.creditsRefunded > 0);
    if (problems.length) setEnded((prev) => [...problems, ...prev].slice(0, 5));
    onFinishedRef.current();
    if (jobs.every((j) => isTerminalStatus(j.status))) void mutate();
  }, [jobs, mutate]);

  const live = inFlightMediaJobs(jobs.length ? jobs : (data?.jobs ?? []));
  const summary = summarizeInProgress(live);
  if (!live.length && !ended.length) return null;

  return (
    <div className="flex flex-col gap-2">
      {live.length > 0 && (
        <section
          aria-label="In progress"
          className="flex flex-col gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm shadow-xs sm:px-4"
        >
          <div className="flex items-center gap-2">
            <LoaderCircleIcon aria-hidden="true" className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
            <p className="min-w-0 flex-1 truncate font-medium">{inProgressLabel(summary)}</p>
            <span className="text-muted-foreground tabular-nums">{summary.percent}%</span>
          </div>
          <Progress
            value={Math.max(4, summary.percent)}
            aria-label="Progress of photos and videos being made"
            aria-valuetext={`${summary.percent}%`}
            className="h-1.5"
            indicatorClassName="bg-brand-gradient"
          />
          <p className="text-xs text-muted-foreground">
            {live.slice(0, 3).map((j, i) => (
              <React.Fragment key={j.id}>
                {i > 0 && " · "}
                {j.batchId ? (
                  <Link href={`/app/batches/${j.batchId}`} className="underline-offset-4 hover:underline">
                    {JOB_TYPE_LABELS[j.type]}
                  </Link>
                ) : (
                  JOB_TYPE_LABELS[j.type]
                )}
              </React.Fragment>
            ))}
            {live.length > 3 && ` · ${live.length - 3} more`}. They appear here as soon as they&apos;re ready.
          </p>
        </section>
      )}
      {ended.length > 0 && (
        <ul aria-label="Recently ended" className="flex flex-col gap-2">
          {ended.map((j) => {
            const refund = refundNote(j);
            const problem = friendlyJobError(j, t);
            return (
              <li
                key={j.id}
                className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-sm"
              >
                <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                <p className="min-w-0 flex-1">
                  <span className="font-medium">
                    {JOB_TYPE_LABELS[j.type]}
                    {j.status === "succeeded" ? " finished with some results removed" : j.status === "canceled" ? " canceled" : " didn't work"}
                  </span>
                  {problem && <span className="text-muted-foreground"> — {problem}</span>}
                  {refund && <span className="text-muted-foreground"> · {refund}</span>}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Dismiss"
                  onClick={() => setEnded((prev) => prev.filter((x) => x.id !== j.id))}
                >
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
