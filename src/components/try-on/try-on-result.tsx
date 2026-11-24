"use client";

import * as React from "react";
import Link from "next/link";
import { DownloadIcon, ImagesIcon, LoaderCircleIcon, RotateCcwIcon, ShirtIcon, XIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { JobProgress } from "@/components/app/job-progress";
import type { GarmentUpload } from "@/components/try-on/types";
import type { JobDTO, MediaDTO } from "@/types/domain";
import { cn } from "@/lib/utils";

export interface TryOnResultProps {
  job: JobDTO | undefined;
  person: MediaDTO;
  garment: GarmentUpload;
  onTryAnother: () => void;
  onRetry: () => void;
  onCancel: () => void;
  retrying?: boolean;
}

/** The visible output of a finished try-on (falls back to a hidden one, e.g. low likeness). */
export function pickResult(job: JobDTO | undefined): MediaDTO | null {
  if (job?.status !== "succeeded") return null;
  return job.media.find((m) => !m.hidden) ?? job.media[0] ?? null;
}

function Panel({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg border bg-muted">{children}</div>
      <figcaption className="text-center text-xs font-medium text-muted-foreground sm:text-sm">{label}</figcaption>
    </figure>
  );
}

/** Side-by-side comparison: your photo | garment | result, plus download and follow-up actions. */
export function TryOnResult({ job, person, garment, onTryAnother, onRetry, onCancel, retrying = false }: TryOnResultProps) {
  const result = pickResult(job);
  const inFlight = !job || job.status === "queued" || job.status === "running";
  const failed = job !== undefined && !inFlight && !result;

  return (
    <section aria-labelledby="try-on-result-heading" className="flex flex-col gap-4">
      <h2 id="try-on-result-heading" className="sr-only">
        Try-on result
      </h2>
      <JobProgress job={job} title={inFlight ? "Dressing you up…" : "Virtual try-on"} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Panel label="Your photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- private signed URLs must bypass the image optimizer */}
          <img src={person.thumbUrl || person.url} alt="Your photo before the try-on" className="size-full object-cover" />
        </Panel>
        <Panel label="Garment">
          {/* eslint-disable-next-line @next/next/no-img-element -- private signed URLs must bypass the image optimizer */}
          <img src={garment.url} alt="The garment you uploaded" className="size-full object-contain" />
        </Panel>
        <Panel label="Result" className="order-first col-span-2 sm:order-none sm:col-span-1">
          {result ? (
            // eslint-disable-next-line @next/next/no-img-element -- private signed URLs must bypass the image optimizer
            <img src={result.url} alt="You wearing the garment" className="size-full object-cover" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
              {inFlight ? (
                <>
                  <LoaderCircleIcon aria-hidden="true" className="size-6 animate-spin text-primary" />
                  Usually ready in under a minute.
                </>
              ) : (
                <>
                  <ShirtIcon aria-hidden="true" className="size-6" />
                  No result this time.
                </>
              )}
            </div>
          )}
        </Panel>
      </div>

      {result?.hidden && (
        <Alert variant="warning">
          <AlertDescription>
            This result didn&apos;t look enough like you, so we refunded your credits. It&apos;s hidden in your gallery
            (turn on &ldquo;show hidden&rdquo; to see it).
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {result && (
          <>
            <Button asChild variant="brand">
              <a href={result.downloadUrl} download>
                <DownloadIcon />
                Download
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/app/gallery/${result.id}`}>
                <ImagesIcon />
                View in gallery
              </Link>
            </Button>
          </>
        )}
        {failed && (
          <Button type="button" variant="brand" onClick={onRetry} disabled={retrying}>
            <RotateCcwIcon />
            Try again
          </Button>
        )}
        {!inFlight && (
          <Button type="button" variant={result ? "outline" : "secondary"} onClick={onTryAnother}>
            <ShirtIcon />
            Try another garment
          </Button>
        )}
        {inFlight && job && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            <XIcon />
            Cancel
          </Button>
        )}
      </div>
    </section>
  );
}
