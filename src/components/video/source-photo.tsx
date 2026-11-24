"use client";

import Link from "next/link";
import { ImageIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MediaDTO } from "@/types/domain";
import { cn } from "@/lib/utils";

export interface SourcePhotoProps {
  source: MediaDTO | null;
  onChoose(): void;
  /** The `?mediaId=` photo couldn't be loaded (deleted, not yours, or a video). */
  missing?: boolean;
  className?: string;
}

/** The photo that will be animated, with a button to (re)pick it from the gallery. */
export function SourcePhoto({ source, onChoose, missing = false, className }: SourcePhotoProps) {
  if (!source) {
    return (
      <section
        aria-label="Source photo"
        className={cn(
          "grain flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground"
        >
          <ImageIcon className="size-6" />
        </span>
        <h2 className="font-semibold">Start with a photo</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          {missing
            ? "That photo isn't available anymore. Choose another one from your gallery."
            : "Pick one of your photos. A sharp portrait with your face clearly visible works best."}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <Button variant="brand" onClick={onChoose}>
            Choose a photo
          </Button>
          <Button asChild variant="ghost">
            <Link href="/app/create">Create new photos</Link>
          </Button>
        </div>
      </section>
    );
  }

  const aspectRatio = source.width && source.height ? `${source.width} / ${source.height}` : "4 / 5";
  return (
    <section aria-label="Source photo" className={cn("flex flex-col gap-3", className)}>
      <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl bg-muted shadow-xs lg:max-w-none">
        {/* eslint-disable-next-line @next/next/no-img-element -- private signed URLs must bypass the image optimizer */}
        <img
          src={source.url}
          alt={source.prompt ? `Selected photo: ${source.prompt.slice(0, 120)}` : "Selected photo"}
          width={source.width ?? undefined}
          height={source.height ?? undefined}
          className="max-h-[60dvh] w-full object-contain"
          style={{ aspectRatio }}
        />
      </div>
      <Button variant="outline" onClick={onChoose} className="self-center lg:self-start">
        <RefreshCwIcon />
        Change photo
      </Button>
    </section>
  );
}
