/**
 * Small, decorative pieces of the darkroom vocabulary shared across the app: viewfinder crop marks,
 * red grease-pencil marks and the film edge print. All of it is `aria-hidden`; say what matters in text.
 */
import { cn } from "@/lib/utils";

import styles from "./darkroom.module.css";

/**
 * Viewfinder crop marks in the four corners of the nearest positioned ancestor.
 * `size` is the arm length; colour follows `currentColor` (set it with a `text-*` class).
 */
export function CropMarks({
  className,
  size = "0.875rem",
  inset = "0px",
  weight = "1.5px",
}: {
  className?: string;
  size?: string;
  inset?: string;
  weight?: string;
}) {
  const vars = { "--crop": size, "--crop-inset": inset, "--crop-w": weight } as React.CSSProperties;
  const arm = "absolute size-(--crop) border-current";
  return (
    <span aria-hidden="true" style={vars} className={cn("pointer-events-none absolute inset-0", className)}>
      <span className={cn(arm, "top-(--crop-inset) left-(--crop-inset) border-t-(length:--crop-w) border-l-(length:--crop-w)")} />
      <span className={cn(arm, "top-(--crop-inset) right-(--crop-inset) border-t-(length:--crop-w) border-r-(length:--crop-w)")} />
      <span className={cn(arm, "bottom-(--crop-inset) left-(--crop-inset) border-b-(length:--crop-w) border-l-(length:--crop-w)")} />
      <span className={cn(arm, "right-(--crop-inset) bottom-(--crop-inset) border-r-(length:--crop-w) border-b-(length:--crop-w)")} />
    </span>
  );
}

/** A hand-drawn red loop around a keeper. Fills its (positioned) parent; draws on once unless `still`. */
export function GreasePencilCircle({ className, still = false }: { className?: string; still?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("pointer-events-none absolute -inset-[6%] size-[112%] overflow-visible text-safelight-ink", className)}
    >
      <path
        d="M53 5C79 4 96 21 95 48C94 77 74 96 47 95C20 94 4 76 5 50C6 25 23 7 57 9"
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className={still ? undefined : styles.draw}
      />
    </svg>
  );
}

/** The grease-pencil ✕ through a reject. Fills its (positioned) parent; draws on once unless `still`. */
export function GreasePencilCross({ className, still = false }: { className?: string; still?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("pointer-events-none absolute inset-[10%] size-[80%] overflow-visible text-safelight-ink", className)}
    >
      <path
        d="M8 10Q48 46 93 91M92 8Q50 53 9 93"
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.75}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className={still ? undefined : styles.draw}
      />
    </svg>
  );
}

/** The film rebate edge print: our own edge code and a frame number, in tiny mono caps. */
export function EdgePrint({
  className,
  frame,
  code = "OPENSHOOT 400 · SAFETY FILM",
}: {
  className?: string;
  frame?: string;
  code?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex items-center gap-3 font-mono text-[0.625rem] leading-none tracking-[0.2em] whitespace-nowrap text-muted-foreground uppercase",
        className,
      )}
    >
      <span className="truncate">{code}</span>
      <span className="h-px min-w-6 flex-1 bg-current opacity-30" />
      {frame && <span className="text-safelight-ink">▸ {frame}</span>}
    </span>
  );
}

/**
 * A row of film sprocket holes (decorative). Colour is `currentColor`: on a dark strip use a paper tone,
 * on paper use the page colour so the holes read as punched through.
 */
export function Sprockets({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block h-1.5 bg-[repeating-linear-gradient(90deg,currentColor_0_7px,transparent_7px_15px)] bg-[length:15px_100%] opacity-80",
        className,
      )}
    />
  );
}

export const darkroomMotion = styles;
