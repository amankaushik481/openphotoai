"use client";

import * as React from "react";
import { CheckIcon, CircleAlertIcon, LoaderCircleIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PhotoIssue, TrainingPhotoDTO } from "@/types/domain";
import { cn } from "@/lib/utils";
import { ISSUE_LABELS } from "./photo-issues";

export interface TrainingPhotoGridProps {
  photos: TrainingPhotoDTO[];
  /** Omit to make the grid read-only. Should throw on failure. */
  onDelete?: (photoId: string) => Promise<void>;
  className?: string;
}

/** Uploaded training photos with per-photo status, issue chips and fix tips (tap a photo). */
export function TrainingPhotoGrid({ photos, onDelete, className }: TrainingPhotoGridProps) {
  if (photos.length === 0) return null;
  return (
    <ul className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6", className)} aria-label="Your training photos">
      {photos.map((photo, i) => (
        <PhotoTile key={photo.id} photo={photo} index={i + 1} onDelete={onDelete} />
      ))}
    </ul>
  );
}

function PhotoTile({
  photo,
  index,
  onDelete,
}: {
  photo: TrainingPhotoDTO;
  index: number;
  onDelete?: (photoId: string) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const issues = photo.quality?.issues ?? [];
  const rejected = photo.status === "rejected";
  const warnings = issues.filter((i) => i.severity === "warning");
  const first = issues[0];
  const statusText = rejected ? "can't be used" : warnings.length ? "accepted, with tips" : "accepted";

  const remove = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(photo.id);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the photo.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <li className="flex flex-col gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Photo ${index}: ${statusText}${first ? ` (${ISSUE_LABELS[first.code]})` : ""}. Show details`}
            className={cn(
              "group relative aspect-[4/5] overflow-hidden rounded-lg border bg-muted outline-none transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/50",
              rejected && "border-destructive/60",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
            <img
              src={photo.thumbUrl}
              alt=""
              loading="lazy"
              className={cn("size-full object-cover transition-transform group-hover:scale-[1.03]", (rejected || deleting) && "opacity-55")}
            />
            <span className="absolute top-1.5 left-1.5">
              <StatusDot rejected={rejected} warned={warnings.length > 0} />
            </span>
            {deleting && (
              <span className="absolute inset-0 flex items-center justify-center">
                <LoaderCircleIcon aria-hidden="true" className="size-6 animate-spin text-white drop-shadow" />
              </span>
            )}
            {first && (
              <span
                className={cn(
                  "absolute inset-x-1 bottom-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium shadow-sm",
                  first.severity === "error" ? "bg-destructive text-destructive-foreground" : "bg-background/90 text-foreground",
                )}
              >
                {ISSUE_LABELS[first.code]}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 max-w-[calc(100vw-2rem)]" align="start">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{rejected ? "This photo can't be used" : "Good photo"}</p>
              {photo.quality && <span className="text-xs text-muted-foreground">Quality {photo.quality.score}/100</span>}
            </div>
            {issues.length > 0 ? (
              <IssueList issues={issues} />
            ) : (
              <p className="text-sm text-muted-foreground">Sharp, well lit and clearly you. Nothing to fix.</p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {onDelete && (
              <Button type="button" variant={rejected ? "destructive" : "outline"} size="sm" onClick={() => void remove()} disabled={deleting}>
                {deleting ? <LoaderCircleIcon className="animate-spin" /> : <Trash2Icon />}
                Remove photo
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </li>
  );
}

function StatusDot({ rejected, warned }: { rejected: boolean; warned: boolean }) {
  if (rejected) {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow">
        <CircleAlertIcon aria-hidden="true" className="size-3.5" />
      </span>
    );
  }
  return (
    <span className={cn("flex size-6 items-center justify-center rounded-full text-white shadow", warned ? "bg-warning" : "bg-success")}>
      {warned ? <TriangleAlertIcon aria-hidden="true" className="size-3.5" /> : <CheckIcon aria-hidden="true" className="size-3.5" />}
    </span>
  );
}

/** Issues with their plain-language message and fix tip. */
export function IssueList({ issues, className }: { issues: PhotoIssue[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {issues.map((issue) => (
        <li key={`${issue.code}-${issue.severity}`} className="flex gap-2 text-sm">
          {issue.severity === "error" ? (
            <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : (
            <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          )}
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">
              <span className="sr-only">{issue.severity === "error" ? "Problem: " : "Tip: "}</span>
              {issue.message}
            </span>
            <span className="text-muted-foreground">{issue.fix}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
