"use client";

import * as React from "react";
import { ImageOffIcon, LoaderCircleIcon, RotateCwIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MediaDTO } from "@/types/domain";
import { clampPan, swipeDirection, zoomAt, type NavDirection, type Zoom } from "./viewer-gestures";

export type StageLoadState = "ok" | "retrying" | "failed";

export interface ViewerStageProps {
  media: MediaDTO;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  zoom: Zoom | null;
  onZoomChange: (zoom: Zoom | null) => void;
  /** Swipe (touch) to the previous / next photo. */
  onSwipe: (direction: NavDirection) => void;
  loadState: StageLoadState;
  onLoadError: () => void;
  onRetry: () => void;
  children?: React.ReactNode;
}

const DOUBLE_TAP_MS = 300;
const TAP_SLOP_PX = 10;

interface Gesture {
  id: number;
  type: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  at: number;
}

/**
 * The photo (or video) itself: double-click / double-tap or the zoom button to look closer, drag to
 * pan while zoomed, swipe left/right on touch screens to browse.
 */
export function ViewerStage({
  media,
  videoRef,
  zoom,
  onZoomChange,
  onSwipe,
  loadState,
  onLoadError,
  onRetry,
  children,
}: ViewerStageProps) {
  const imgRef = React.useRef<HTMLImageElement>(null);
  const gesture = React.useRef<Gesture | null>(null);
  const lastTap = React.useRef<{ at: number; x: number; y: number } | null>(null);
  // Some touch browsers also fire dblclick for a double tap: don't toggle the zoom twice.
  const touchToggledAt = React.useRef(-Infinity);
  const [panning, setPanning] = React.useState(false);
  const isImage = media.kind === "image";
  const zoomed = Boolean(zoom && zoom.scale > 1);

  const size = () => {
    const img = imgRef.current;
    return { width: img?.offsetWidth ?? 0, height: img?.offsetHeight ?? 0 };
  };

  /** Zoom in on a viewport point (unzoomed image), or back out. */
  const toggleZoomAt = (clientX?: number, clientY?: number) => {
    const img = imgRef.current;
    if (!img) return;
    if (zoomed) return onZoomChange(null);
    const rect = img.getBoundingClientRect();
    const s = size();
    const point =
      clientX === undefined || clientY === undefined
        ? { x: s.width / 2, y: s.height / 2 }
        : { x: clientX - rect.left, y: clientY - rect.top };
    onZoomChange(zoomAt(point, s));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isImage || (e.pointerType === "mouse" && e.button !== 0) || !e.isPrimary) return;
    gesture.current = {
      id: e.pointerId,
      type: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      at: e.timeStamp,
    };
    if (zoomed) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setPanning(true);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId || !zoomed || !zoom) return;
    const dx = e.clientX - g.lastX;
    const dy = e.clientY - g.lastY;
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    onZoomChange(clampPan({ scale: zoom.scale, x: zoom.x + dx, y: zoom.y + dy }, size()));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setPanning(false);
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (g.type === "mouse") return; // mice double-click (below)
    if (!zoomed) {
      const direction = swipeDirection({ dx, dy, ms: e.timeStamp - g.at });
      if (direction) {
        lastTap.current = null;
        return onSwipe(direction);
      }
    }
    if (Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX) return;
    const prev = lastTap.current;
    if (
      prev &&
      e.timeStamp - prev.at < DOUBLE_TAP_MS &&
      Math.abs(e.clientX - prev.x) < 3 * TAP_SLOP_PX &&
      Math.abs(e.clientY - prev.y) < 3 * TAP_SLOP_PX
    ) {
      lastTap.current = null;
      touchToggledAt.current = e.timeStamp;
      toggleZoomAt(e.clientX, e.clientY);
    } else {
      lastTap.current = { at: e.timeStamp, x: e.clientX, y: e.clientY };
    }
  };

  return (
    <figure
      className={cn(
        // Desktop: the photo stays in view (sticky, one screen tall) while the details column scrolls.
        "relative flex min-h-[40dvh] items-center justify-center overflow-hidden rounded-xl bg-muted select-none lg:sticky lg:top-24 lg:h-[calc(100dvh-8rem)] lg:min-h-[28rem] lg:self-start",
        // Not zoomed: the page still scrolls vertically and pinches natively; horizontal moves are ours (swipe).
        isImage && (zoomed ? "touch-none" : "touch-pan-y touch-pinch-zoom"),
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        gesture.current = null;
        setPanning(false);
      }}
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- private signed URLs bypass the image optimizer
        <img
          ref={imgRef}
          src={media.url}
          alt={media.prompt ? media.prompt.slice(0, 200) : "Generated photo"}
          width={media.width ?? undefined}
          height={media.height ?? undefined}
          fetchPriority="high"
          draggable={false}
          onDoubleClick={(e) => {
            if (e.timeStamp - touchToggledAt.current > 600) toggleZoomAt(e.clientX, e.clientY);
          }}
          onError={onLoadError}
          style={zoom ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` } : undefined}
          className={cn(
            "max-h-[75dvh] w-auto max-w-full object-contain lg:max-h-full",
            !panning && "transition-transform duration-200 ease-out motion-reduce:transition-none",
            zoomed ? "cursor-grab active:cursor-grabbing" : "pointer-fine:cursor-zoom-in",
            loadState !== "ok" && "invisible",
          )}
        />
      ) : (
        <video
          ref={videoRef}
          src={media.url}
          poster={media.thumbUrl !== media.url ? media.thumbUrl : undefined}
          controls
          playsInline
          loop
          preload="metadata"
          onError={onLoadError}
          className="max-h-[75dvh] w-full lg:max-h-full"
        />
      )}

      {loadState !== "ok" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center" role="status">
          {loadState === "retrying" ? (
            <>
              <LoaderCircleIcon aria-hidden="true" className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none" />
              <p className="text-sm text-muted-foreground">Reloading…</p>
            </>
          ) : (
            <>
              <ImageOffIcon aria-hidden="true" className="size-8 text-muted-foreground" />
              <p className="max-w-xs text-sm text-muted-foreground">
                We couldn&apos;t load this {isImage ? "photo" : "video"}. Check your connection and try again.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                <RotateCwIcon aria-hidden="true" />
                Try again
              </Button>
            </>
          )}
        </div>
      )}

      {isImage && loadState === "ok" && (
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-pressed={zoomed}
          aria-label={zoomed ? "Zoom out" : "Zoom in"}
          title={zoomed ? "Zoom out (Esc)" : "Zoom in (or double-click the photo)"}
          onClick={() => toggleZoomAt()}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-3 bottom-3 bg-background/85 shadow-sm backdrop-blur-sm"
        >
          {zoomed ? <ZoomOutIcon /> : <ZoomInIcon />}
        </Button>
      )}

      {children}
    </figure>
  );
}
