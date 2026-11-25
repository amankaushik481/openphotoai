"use client";

import * as React from "react";
import { CircleAlertIcon, LoaderCircleIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GreasePencilCross } from "@/components/ui/darkroom";
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

/**
 * Uploaded training photos as a contact sheet: numbered frames, a red grease-pencil ✕ through the ones that
 * can't be used with the reason written under them, and fix tips when you tap a frame.
 */
export function TrainingPhotoGrid({ photos, onDelete, className }: TrainingPhotoGridProps) {
  if (photos.length === 0) return null;
  return (
    <ul
      className={cn(
        "grid grid-cols-3 gap-x-2 gap-y-3 rounded-xs border border-foreground/12 bg-card p-2.5 sm:grid-cols-4 sm:gap-x-3 sm:p-3.5 lg:grid-cols-6",
        className,
      )}
      aria-label="Your training photos"
    >
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
    <li className="flex min-w-0 flex-col">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Photo ${index}: ${statusText}${first ? ` (${ISSUE_LABELS[first.code]})` : ""}. Show details`}
            className="group flex min-w-0 flex-col gap-1.5 rounded-[1px] text-left"
          >
            <span className="relative block aspect-[4/5] w-full rounded-[1px] bg-darkroom">
              <span className="absolute inset-0 overflow-hidden rounded-[1px]">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img
                  src={photo.thumbUrl}
                  alt=""
                  loading="lazy"
                  className={cn(
                    "size-full object-cover transition-[filter,opacity] group-hover:brightness-105",
                    rejected && "opacity-60 grayscale",
                    deleting && "opacity-40",
                  )}
                />
              </span>
              {rejected && <GreasePencilCross still />}
              {deleting && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <LoaderCircleIcon aria-hidden="true" className="size-6 animate-spin text-white drop-shadow" />
                </span>
              )}
            </span>
            <FrameCaption
              index={index}
              rejected={rejected}
              warned={warnings.length > 0}
              label={first ? ISSUE_LABELS[first.code] : null}
            />
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

/** The mono line under a frame: its number, then ✓, a tip, or the reason in grease-pencil red on a reject. */
function FrameCaption({
  index,
  rejected,
  warned,
  label,
}: {
  index: number;
  rejected: boolean;
  warned: boolean;
  label: string | null;
}) {
  return (
    <span
      aria-hidden="true"
      className="flex min-w-0 items-baseline justify-between gap-1 font-mono text-[0.625rem] leading-tight tracking-[0.1em] uppercase"
    >
      <span className={cn("shrink-0", rejected ? "text-safelight-ink" : "text-muted-foreground")}>
        {String(index).padStart(2, "0")}
      </span>
      {rejected ? (
        <span className="truncate text-safelight-ink">✕ {label}</span>
      ) : warned ? (
        <span className="truncate text-warning">{label ?? "Tip"}</span>
      ) : (
        <span className="text-success">✓ OK</span>
      )}
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
