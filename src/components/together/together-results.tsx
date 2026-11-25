"use client";

import * as React from "react";
import Link from "next/link";
import { ImagesIcon } from "lucide-react";

import { EmptySheet } from "@/components/gallery/empty-sheet";
import { JobProgress } from "@/components/app/job-progress";
import { MediaGrid } from "@/components/app/media-grid";
import { Button } from "@/components/ui/button";
import { useJob } from "@/hooks/use-job";
import { useMe } from "@/hooks/use-me";
import type { JobDTO } from "@/types/domain";

export interface TogetherResultsProps {
  /** Jobs created on this page, newest first. */
  jobs: readonly JobDTO[];
}

export function TogetherResults({ jobs }: TogetherResultsProps) {
  return (
    <section aria-labelledby="together-results-title" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="together-results-title" className="font-display text-3xl leading-none tracking-tight">
          Results
        </h2>
        {jobs.length > 0 && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/app/gallery">
              <ImagesIcon aria-hidden="true" />
              Open gallery
            </Link>
          </Button>
        )}
      </div>
      {jobs.length === 0 ? (
        <EmptySheet
          headingLevel={3}
          frames={4}
          label="Two up"
          title="Your together photos appear here"
          description="They're saved to your gallery. Your friend's model is only used for the photos you create together."
          className="border-t-0 pt-0"
        />
      ) : (
        <div className="flex flex-col gap-6">
          {jobs.map((job) => (
            <TogetherJob key={job.id} initial={job} />
          ))}
        </div>
      )}
    </section>
  );
}

function TogetherJob({ initial }: { initial: JobDTO }) {
  const { mutate: mutateMe } = useMe();
  // Refunds (failures, blocked outputs) change the balance: refresh it when the job settles.
  const { job } = useJob(initial.id, { fallbackJob: initial, onTerminal: () => void mutateMe() });
  const current = job ?? initial;
  const [showHidden, setShowHidden] = React.useState(false);
  const pending = current.status === "queued" || current.status === "running";
  const expected = "numImages" in current.input ? current.input.numImages : 1;

  return (
    <div className="flex flex-col gap-3">
      <JobProgress job={current} title={expected === 1 ? "Together photo" : `${expected} together photos`} />
      {(pending || current.media.length > 0) && (
        <MediaGrid
          media={current.media}
          loading={pending && current.media.length === 0}
          skeletonCount={expected}
          showHidden={showHidden}
          onShowHiddenChange={setShowHidden}
        />
      )}
    </div>
  );
}
