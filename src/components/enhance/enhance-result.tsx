"use client";

import * as React from "react";
import Link from "next/link";
import { DownloadIcon, ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MediaDTO } from "@/types/domain";
import { isTransparentImage, sizeOf } from "./enhance-rules";
import { formatSize } from "./enhance-ui";

/** Checkerboard behind transparent images (theme-aware via CSS variables). */
export const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundColor: "var(--background)",
  backgroundImage: "repeating-conic-gradient(var(--muted) 0% 25%, transparent 0% 50%)",
  backgroundSize: "20px 20px",
};

export interface EnhanceResultProps {
  media: MediaDTO;
  /** Accessible description of what was done, e.g. "Upscaled photo". */
  alt: string;
  className?: string;
}

/** Finished enhancement: preview (checkerboard for transparent PNGs), resolution, download + open. */
export function EnhanceResult({ media, alt, className }: EnhanceResultProps) {
  const transparent = isTransparentImage(media.mimeType);
  const size = sizeOf(media);
  const details = [size ? formatSize(size) : null, transparent ? "Transparent PNG" : null].filter(Boolean).join(" · ");

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <div
        className={cn("flex justify-center overflow-hidden rounded-lg border", !transparent && "bg-muted")}
        style={transparent ? CHECKERBOARD_STYLE : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- private signed URLs must bypass the image optimizer */}
        <img
          src={media.url}
          alt={alt}
          width={media.width ?? undefined}
          height={media.height ?? undefined}
          decoding="async"
          className="h-auto max-h-80 w-auto max-w-full object-contain"
        />
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground tabular-nums">{details}</span>
        <span className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={media.downloadUrl} download>
              <DownloadIcon aria-hidden="true" />
              Download
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/app/gallery/${media.id}`}>
              <ExternalLinkIcon aria-hidden="true" />
              Open
            </Link>
          </Button>
        </span>
      </figcaption>
    </figure>
  );
}
