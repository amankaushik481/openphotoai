"use client";

import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MediaDTO } from "@/types/domain";
import { cn } from "@/lib/utils";
import { FilmStrip } from "@/components/gallery/marks";

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
      <section aria-label="Source photo" className={cn("flex flex-col gap-4", className)}>
        {/* An unexposed strip of film: the frame waits for a photo. */}
        <FilmStrip edge="OpenShoot 400 · ▸ 01" frameClassName="aspect-[4/5] max-h-[44dvh] w-full border border-dashed border-darkroom-line">
          <span className="mono-caps absolute bottom-2 left-2 text-darkroom-muted">No frame loaded</span>
        </FilmStrip>
        <h2 className="font-display text-3xl leading-none tracking-tight">Start with a photo</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {missing
            ? "That photo isn't available anymore. Choose another one from your gallery."
            : "Pick one of your photos. A sharp portrait with your face clearly visible works best."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
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
      {/* The frame that will be animated, on a strip of film. */}
      <FilmStrip
        edge={`OpenShoot 400 · ▸ ${source.id.slice(-4).toUpperCase()}`}
        className="mx-auto w-full max-w-sm lg:max-w-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- private signed URLs must bypass the image optimizer */}
        <img
          src={source.url}
          alt={source.prompt ? `Selected photo: ${source.prompt.slice(0, 120)}` : "Selected photo"}
          width={source.width ?? undefined}
          height={source.height ?? undefined}
          className="max-h-[60dvh] w-full bg-darkroom object-contain"
          style={{ aspectRatio }}
        />
      </FilmStrip>
      <Button variant="outline" onClick={onChoose} className="self-center lg:self-start">
        <RefreshCwIcon />
        Change photo
      </Button>
    </section>
  );
}
