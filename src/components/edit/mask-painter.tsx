"use client";

import * as React from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BrushIcon,
  EraserIcon,
  HandIcon,
  Redo2Icon,
  RotateCcwIcon,
  Trash2Icon,
  Undo2Icon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  binarizeMask,
  clientToCanvas,
  dabSpacing,
  EMPTY_HISTORY,
  fitWithin,
  hasPaint,
  IDENTITY_VIEW,
  interpolateStroke,
  MAX_ZOOM,
  panView,
  pinchView,
  pushAction,
  redoAction,
  screenToCanvasLength,
  strokeDabs,
  undoAction,
  visibleStrokes,
  zoomAt,
  type MaskAction,
  type MaskHistory,
  type PinchStart,
  type Point,
  type Size,
  type Stroke,
  type StrokeMode,
  type View,
} from "./geometry";

/** Longest side of the on-screen working canvas (keeps memory sane on phones). */
export const WORK_MAX_SIDE = 2048;
/** Longest side of the exported mask; larger photos get a same-aspect mask the server resizes. */
export const EXPORT_MAX_SIDE = 4096;
export const BRUSH_MIN = 8;
export const BRUSH_MAX = 160;
export const BRUSH_DEFAULT = 48;
const BRUSH_STEP = 8;
const KEY_PAN_PX = 48;
const ZOOM_STEP = 1.25;
const PAINT_COLOR = "#ec4899";

export type PainterTool = StrokeMode | "move";

export interface MaskExport {
  /** Opaque black/white PNG: white = repaint. */
  blob: Blob;
  width: number;
  height: number;
  /** 0..1 painted fraction. */
  coverage: number;
}

export interface MaskPainterHandle {
  /** The mask at the photo's natural resolution, or null when nothing is painted. */
  exportMask(): Promise<MaskExport | null>;
  clear(): void;
}

export interface MaskPainterProps {
  imageUrl: string;
  /** Natural size of the photo; measured from the loaded image when unknown. */
  width?: number | null;
  height?: number | null;
  alt: string;
  disabled?: boolean;
  /** Fires whenever the painted / empty state may have changed. */
  onPaintChange?: (painted: boolean) => void;
  ref?: React.Ref<MaskPainterHandle>;
  className?: string;
}

function drawDabs(ctx: CanvasRenderingContext2D, mode: StrokeMode, size: number, dabs: readonly Point[]) {
  if (dabs.length === 0) return;
  const r = size / 2;
  ctx.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";
  ctx.fillStyle = PAINT_COLOR;
  ctx.beginPath();
  for (const p of dabs) {
    ctx.moveTo(p.x + r, p.y);
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

const clampBrush = (n: number) => Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, n));

/**
 * Brush mask painter over a photo: paint / erase with mouse, pen or touch, undo/redo/clear, pinch or
 * Ctrl+wheel to zoom, two fingers / hand tool / wheel / pan buttons to pan. Keyboard: arrows move a brush
 * reticle (Shift+arrows paint, Space stamps), [ ] brush size, B/E/H tools, +/−/0 zoom, arrows pan with the
 * hand tool, Ctrl+Z / Ctrl+Shift+Z undo/redo. `ref.exportMask()` returns the black/white PNG.
 */
export function MaskPainter({ imageUrl, width, height, alt, disabled = false, onPaintChange, ref, className }: MaskPainterProps) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const hintId = React.useId();
  const sizeLabelId = React.useId();

  const [measured, setMeasured] = React.useState<Size | null>(null);
  const naturalWidth = width || measured?.width || 0;
  const naturalHeight = height || measured?.height || 0;
  const natural = React.useMemo<Size | null>(
    () => (naturalWidth && naturalHeight ? { width: naturalWidth, height: naturalHeight } : null),
    [naturalWidth, naturalHeight],
  );
  const work = React.useMemo(() => (natural ? fitWithin(natural, WORK_MAX_SIDE) : null), [natural]);

  const [tool, setTool] = React.useState<PainterTool>("paint");
  const [brush, setBrush] = React.useState(BRUSH_DEFAULT);
  const [history, setHistory] = React.useState<MaskHistory>(EMPTY_HISTORY);
  const [view, setView] = React.useState<View>(IDENTITY_VIEW);
  // The brush ring follows the pointer imperatively (no re-render per mouse move).
  const [hovering, setHovering] = React.useState(false);
  const ringRef = React.useRef<HTMLSpanElement | null>(null);
  const lastHover = React.useRef<Point | null>(null);

  const live = React.useRef({ history, view, tool, brush, work, onPaintChange });
  React.useEffect(() => {
    live.current = { history, view, tool, brush, work, onPaintChange };
  });

  // Keyboard painting (WCAG 2.1.1): a reticle in canvas coordinates moved with the arrow keys.
  const [keyCursor, setKeyCursor] = React.useState<Point | null>(null);
  const [focusVisible, setFocusVisible] = React.useState(false);
  const [keyStatus, setKeyStatus] = React.useState("");

  const pointers = React.useRef(new Map<number, Point>());
  const stroke = React.useRef<{ pointerId: number; stroke: Stroke; last: Point } | null>(null);
  const pinch = React.useRef<PinchStart | null>(null);
  const pan = React.useRef<{ pointerId: number; last: Point } | null>(null);

  /* ───────── drawing ───────── */

  const redraw = React.useCallback((done: readonly MaskAction[]) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of visibleStrokes(done)) drawDabs(ctx, s.mode, s.size, strokeDabs(s));
  }, []);

  // Replays on undo/redo/clear and after the canvas is (re)sized, which wipes it.
  React.useEffect(() => {
    redraw(history.done);
    live.current.onPaintChange?.(hasPaint(history.done));
  }, [history, work, redraw]);

  const commit = React.useCallback((action: MaskAction) => setHistory((h) => pushAction(h, action)), []);
  const undo = React.useCallback(() => setHistory(undoAction), []);
  const redo = React.useCallback(() => setHistory(redoAction), []);
  const clear = React.useCallback(
    () => setHistory((h) => (visibleStrokes(h.done).length ? pushAction(h, { kind: "clear" }) : h)),
    [],
  );

  /* ───────── view ───────── */

  const viewportSize = (): Size => ({
    width: viewportRef.current?.clientWidth || 1,
    height: viewportRef.current?.clientHeight || 1,
  });
  const viewportPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 };
  };
  const placeRing = (el: HTMLSpanElement | null, size = live.current.brush) => {
    const p = lastHover.current;
    if (!el || !p) return;
    const r = size / 2;
    el.style.transform = `translate(${p.x - r}px, ${p.y - r}px)`;
  };
  const zoomBy = (factor: number) => {
    const size = viewportSize();
    setView((v) => zoomAt(v, { x: size.width / 2, y: size.height / 2 }, v.scale * factor, size));
  };
  const panBy = (dx: number, dy: number) => setView((v) => panView(v, dx, dy, viewportSize()));

  // Wheel needs a non-passive listener: Ctrl/⌘ + wheel (and trackpad pinch) zooms, plain wheel pans when zoomed.
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const v = live.current.view;
      const rect = el.getBoundingClientRect();
      const size = { width: el.clientWidth || 1, height: el.clientHeight || 1 };
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        setView(zoomAt(v, anchor, v.scale * Math.exp(-e.deltaY * 0.01), size));
      } else if (v.scale > 1) {
        e.preventDefault();
        setView(panView(v, -e.deltaX, -e.deltaY, size));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Pan offsets are in viewport px: start over when the viewport changes size (rotation, layout).
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setView(IDENTITY_VIEW));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ───────── pointer input ───────── */

  const canvasPointOf = (e: { clientX: number; clientY: number }): Point | null => {
    const canvas = canvasRef.current;
    const size = live.current.work;
    if (!canvas || !size) return null;
    return clientToCanvas(e.clientX, e.clientY, canvas.getBoundingClientRect(), size);
  };

  const abandonStroke = () => {
    if (!stroke.current) return;
    stroke.current = null;
    redraw(live.current.history.done);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !work) return;
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, viewportPoint(e));

    if (pointers.current.size === 2) {
      // A second finger means pinch/pan, not paint: drop the stroke the first finger started.
      abandonStroke();
      pan.current = null;
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      pinch.current = { view: live.current.view, a, b };
      return;
    }
    if (pointers.current.size > 2) return;

    if (live.current.tool === "move" || e.button === 1) {
      pan.current = { pointerId: e.pointerId, last: viewportPoint(e) };
      return;
    }
    const p = canvasPointOf(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!p || !canvas || !ctx) return;
    const size = screenToCanvasLength(live.current.brush, canvas.getBoundingClientRect().width, canvas.width);
    const mode: StrokeMode = live.current.tool === "erase" ? "erase" : "paint";
    stroke.current = { pointerId: e.pointerId, stroke: { mode, size, points: [p] }, last: p };
    drawDabs(ctx, mode, size, [p]);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") {
      lastHover.current = viewportPoint(e);
      if (!hovering) setHovering(true);
      placeRing(ringRef.current);
    }
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, viewportPoint(e));

    if (pinch.current) {
      if (pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()] as [Point, Point];
        setView(pinchView(pinch.current, a, b, viewportSize()));
      }
      return;
    }
    if (pan.current?.pointerId === e.pointerId) {
      const now = viewportPoint(e);
      panBy(now.x - pan.current.last.x, now.y - pan.current.last.y);
      pan.current.last = now;
      return;
    }
    const active = stroke.current;
    if (active?.pointerId !== e.pointerId) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    // Coalesced events keep fast pen/finger strokes smooth.
    const samples = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length ? samples : [e]) {
      const p = canvasPointOf(sample);
      if (!p) continue;
      drawDabs(ctx, active.stroke.mode, active.stroke.size, interpolateStroke(active.last, p, dabSpacing(active.stroke.size)));
      active.stroke.points.push(p);
      active.last = p;
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>, canceled: boolean) => {
    pointers.current.delete(e.pointerId);
    if (stroke.current?.pointerId === e.pointerId) {
      if (canceled) abandonStroke();
      else {
        commit({ kind: "stroke", stroke: stroke.current.stroke });
        stroke.current = null;
      }
    }
    if (pan.current?.pointerId === e.pointerId) pan.current = null;
    if (pinch.current && pointers.current.size < 2) pinch.current = null;
  };

  /* ───────── keyboard ───────── */

  /** Paint (or erase) a dab, or a segment when `from` is given, at canvas points; one undo step. */
  const keyboardStroke = (to: Point, from?: Point) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const mode: StrokeMode = live.current.tool === "erase" ? "erase" : "paint";
    const size = screenToCanvasLength(live.current.brush, canvas.getBoundingClientRect().width, canvas.width);
    const points = from ? [from, to] : [to];
    drawDabs(ctx, mode, size, from ? interpolateStroke(from, to, dabSpacing(size)) : [to]);
    commit({ kind: "stroke", stroke: { mode, size, points } });
    setKeyStatus(mode === "erase" ? "Erased" : "Painted");
  };

  /** Arrows move the reticle (Shift paints along the way); Space/Enter stamps one dab. */
  const onCursorKey = (key: string, shift: boolean): boolean => {
    const canvas = canvasRef.current;
    const size = live.current.work;
    if (!canvas || !size) return false;
    const start = keyCursor ?? { x: size.width / 2, y: size.height / 2 };
    if (key === " " || key === "enter") {
      setKeyCursor(start);
      keyboardStroke(start);
      return true;
    }
    const dir: Record<string, Point> = {
      arrowleft: { x: -1, y: 0 },
      arrowright: { x: 1, y: 0 },
      arrowup: { x: 0, y: -1 },
      arrowdown: { x: 0, y: 1 },
    };
    const d = dir[key];
    if (!d) return false;
    // Half a brush per press, in canvas pixels.
    const step = screenToCanvasLength(Math.max(4, live.current.brush / 2), canvas.getBoundingClientRect().width, canvas.width);
    const next = {
      x: Math.min(size.width, Math.max(0, start.x + d.x * step)),
      y: Math.min(size.height, Math.max(0, start.y + d.y * step)),
    };
    setKeyCursor(next);
    if (shift) keyboardStroke(next, start);
    return true;
  };

  // Place the reticle in viewport pixels; follows zoom/pan via the canvas' on-screen rect.
  const reticleRef = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => {
    const el = reticleRef.current;
    const canvas = canvasRef.current;
    const vp = viewportRef.current;
    if (!el || !keyCursor || !canvas || !vp || !work) return;
    const c = canvas.getBoundingClientRect();
    const v = vp.getBoundingClientRect();
    const x = c.left - v.left + (keyCursor.x / work.width) * c.width;
    const y = c.top - v.top + (keyCursor.y / work.height) * c.height;
    el.style.transform = `translate(${x - brush / 2}px, ${y - brush / 2}px)`;
  }, [keyCursor, view, brush, work, focusVisible]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && (key === "z" || key === "y")) {
      e.preventDefault();
      if (key === "y" || e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod || e.altKey) return;
    setFocusVisible(true);
    if (live.current.tool !== "move" && onCursorKey(key, e.shiftKey)) {
      e.preventDefault();
      return;
    }
    const handled: Record<string, () => void> = {
      "[": () => setBrush((b) => clampBrush(b - BRUSH_STEP)),
      "]": () => setBrush((b) => clampBrush(b + BRUSH_STEP)),
      b: () => setTool("paint"),
      e: () => setTool("erase"),
      h: () => setTool("move"),
      "+": () => zoomBy(ZOOM_STEP),
      "=": () => zoomBy(ZOOM_STEP),
      "-": () => zoomBy(1 / ZOOM_STEP),
      "0": () => setView(IDENTITY_VIEW),
      arrowleft: () => panBy(KEY_PAN_PX, 0),
      arrowright: () => panBy(-KEY_PAN_PX, 0),
      arrowup: () => panBy(0, KEY_PAN_PX),
      arrowdown: () => panBy(0, -KEY_PAN_PX),
    };
    const action = handled[key];
    if (!action) return;
    e.preventDefault();
    action();
  };

  /* ───────── export ───────── */

  React.useImperativeHandle(
    ref,
    () => ({
      async exportMask() {
        const canvas = canvasRef.current;
        if (!canvas || !natural || !hasPaint(live.current.history.done)) return null;
        const size = fitWithin(natural, EXPORT_MAX_SIDE);
        const out = document.createElement("canvas");
        out.width = size.width;
        out.height = size.height;
        const ctx = out.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(canvas, 0, 0, size.width, size.height);
        const pixels = ctx.getImageData(0, 0, size.width, size.height);
        const painted = binarizeMask(pixels.data);
        if (painted === 0) return null;
        ctx.putImageData(pixels, 0, 0);
        const blob = await canvasToPng(out);
        return blob ? { blob, ...size, coverage: painted / (size.width * size.height) } : null;
      },
      clear,
    }),
    [natural, clear],
  );

  const painted = hasPaint(history.done);
  const showRing = hovering && tool !== "move" && !disabled;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        ref={viewportRef}
        role="application"
        aria-roledescription="mask painter"
        aria-label={`Brush mask on ${alt}`}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          const visible = e.currentTarget.matches(":focus-visible");
          setFocusVisible(visible);
          if (visible && !keyCursor && work) setKeyCursor({ x: work.width / 2, y: work.height / 2 });
        }}
        onBlur={() => setFocusVisible(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e, false)}
        onPointerCancel={(e) => endPointer(e, true)}
        onLostPointerCapture={(e) => endPointer(e, false)}
        onPointerLeave={() => setHovering(false)}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          // Phones: cap the height so the page can still be scrolled beside/below the canvas; with the
          // move tool at 100% a one-finger drag scrolls the page instead of being captured.
          "relative mx-auto w-full overflow-hidden rounded-xl bg-muted select-none [--painter-max-h:55dvh] sm:[--painter-max-h:70dvh]",
          tool === "move" && view.scale === 1 ? "touch-pan-y" : "touch-none",
          tool === "move" ? "cursor-grab active:cursor-grabbing" : showRing ? "cursor-none" : "cursor-crosshair",
          disabled && "pointer-events-none opacity-70",
        )}
        style={{
          aspectRatio: natural ? `${natural.width} / ${natural.height}` : "4 / 5",
          maxWidth: natural ? `calc(var(--painter-max-h) * ${natural.width / natural.height})` : undefined,
        }}
      >
        <div
          className="absolute inset-0 origin-top-left will-change-transform"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- private signed URLs bypass the image optimizer */}
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="size-full object-contain"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) setMeasured({ width: img.naturalWidth, height: img.naturalHeight });
            }}
          />
          {work && (
            <canvas
              ref={canvasRef}
              width={work.width}
              height={work.height}
              aria-hidden="true"
              className="absolute inset-0 size-full opacity-55"
            />
          )}
        </div>

        {showRing && (
          <span
            ref={(el) => {
              ringRef.current = el;
              placeRing(el, brush);
            }}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)]"
            style={{ width: brush, height: brush }}
          />
        )}
        {focusVisible && keyCursor && tool !== "move" && !disabled && (
          <span
            ref={reticleRef}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 rounded-full border-2 border-dashed border-white shadow-[0_0_0_2px_rgb(0_0_0/0.6)]"
            style={{ width: brush, height: brush }}
          />
        )}
        {!painted && (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            Brush over the area to change
          </span>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {keyStatus}
      </p>
      <p id={hintId} className="sr-only">
        Drag or tap to paint the area to repaint. Keyboard: arrow keys move the brush cursor, Shift plus arrows
        paint along the way, Space paints one dab. Shortcuts: B paint, E erase, H move (then arrow keys move
        around), open and close bracket change the brush size, plus and minus zoom, 0 resets the zoom, Control Z
        undoes and Control Shift Z redoes.
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={tool}
          onValueChange={(v) => v && setTool(v as PainterTool)}
          disabled={disabled}
          aria-label="Brush tool"
        >
          <ToggleGroupItem value="paint" aria-label="Paint (B)" title="Paint (B)" className="px-3">
            <BrushIcon />
            <span className="max-sm:sr-only">Paint</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="erase" aria-label="Erase (E)" title="Erase (E)" className="px-3">
            <EraserIcon />
            <span className="max-sm:sr-only">Erase</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="move" aria-label="Move (H)" title="Move (H)" className="px-3">
            <HandIcon />
            <span className="max-sm:sr-only">Move</span>
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={undo} disabled={disabled || history.done.length === 0} aria-label="Undo" title="Undo (Ctrl+Z)">
            <Undo2Icon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={redo} disabled={disabled || history.undone.length === 0} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
            <Redo2Icon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={clear} disabled={disabled || !visibleStrokes(history.done).length} aria-label="Clear mask" title="Clear mask">
            <Trash2Icon />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-48 flex-1 items-center gap-3">
          <Label id={sizeLabelId} className="shrink-0 text-sm">
            Brush size
          </Label>
          <Slider
            aria-labelledby={sizeLabelId}
            min={BRUSH_MIN}
            max={BRUSH_MAX}
            step={2}
            value={[brush]}
            onValueChange={([v]) => v !== undefined && setBrush(v)}
            disabled={disabled}
          />
          <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{brush}px</span>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={disabled || view.scale <= 1} aria-label="Zoom out" title="Zoom out (−)">
            <ZoomOutIcon />
          </Button>
          <span className="w-11 text-center text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {Math.round(view.scale * 100)}%
          </span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => zoomBy(ZOOM_STEP)} disabled={disabled || view.scale >= MAX_ZOOM} aria-label="Zoom in" title="Zoom in (+)">
            <ZoomInIcon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setView(IDENTITY_VIEW)} disabled={disabled || view.scale === 1} aria-label="Reset zoom" title="Reset zoom (0)">
            <RotateCcwIcon />
          </Button>
        </div>
        {/* Single-pointer alternative to dragging / two-finger panning (WCAG 2.5.7). */}
        {view.scale > 1 && (
          <div role="group" aria-label="Move the zoomed photo" className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => panBy(KEY_PAN_PX, 0)} disabled={disabled} aria-label="Show more on the left">
              <ArrowLeftIcon />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => panBy(0, KEY_PAN_PX)} disabled={disabled} aria-label="Show more above">
              <ArrowUpIcon />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => panBy(0, -KEY_PAN_PX)} disabled={disabled} aria-label="Show more below">
              <ArrowDownIcon />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => panBy(-KEY_PAN_PX, 0)} disabled={disabled} aria-label="Show more on the right">
              <ArrowRightIcon />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
