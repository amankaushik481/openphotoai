"use client";

import * as React from "react";
import Link from "next/link";
import { PencilLineIcon, SquareSplitHorizontalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { JobProgress } from "@/components/app/job-progress";
import { MediaGrid } from "@/components/app/media-grid";
import type { JobDTO, MediaDTO } from "@/types/domain";
import { cn } from "@/lib/utils";

export interface JobResultsProps {
  /** Jobs started on this page, newest first (live, e.g. from useSessionJobs). */
  jobs: readonly JobDTO[];
  /** Show a "Compare" action that puts a result into the before/after view. */
  onCompare?: (media: MediaDTO) => void;
  compareId?: string | null;
  /** Heading for the section. */
  title?: string;
  className?: string;
}

/** Progress for running/failed jobs + a grid of finished results with "compare" and "edit this" actions. */
export function JobResults({ jobs, onCompare, compareId, title = "Results", className }: JobResultsProps) {
  const headingId = React.useId();
  const [showHidden, setShowHidden] = React.useState(false);
  const pending = jobs.filter((j) => j.status !== "succeeded");
  const media = React.useMemo(() => jobs.filter((j) => j.status === "succeeded").flatMap((j) => j.media), [jobs]);

  if (jobs.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-4", className)}>
      <h2 id={headingId} className="text-lg font-semibold">
        {title}
      </h2>
      {pending.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {pending.map((job) => (
            <li key={job.id}>
              <JobProgress job={job} />
            </li>
          ))}
        </ul>
      )}
      <MediaGrid
        media={media}
        showHidden={showHidden}
        onShowHiddenChange={setShowHidden}
        renderActions={(m) => (
          <>
            {onCompare && (
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                aria-pressed={compareId === m.id}
                aria-label="Compare with the original"
                title="Compare with the original"
                onClick={() => onCompare(m)}
                className="bg-background/90 backdrop-blur-sm"
              >
                <SquareSplitHorizontalIcon />
              </Button>
            )}
            <Button asChild size="sm" variant="secondary" className="h-8 bg-background/90 backdrop-blur-sm">
              <Link href={`/app/edit/${m.id}`} title="Use as the new source and keep editing">
                <PencilLineIcon />
                Edit
              </Link>
            </Button>
          </>
        )}
      />
    </section>
  );
}
