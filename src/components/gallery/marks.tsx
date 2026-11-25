import { cn } from "@/lib/utils";

/**
 * Darkroom marks for the app's light table: red grease-pencil loops, dots and crosses (as an editor marks a
 * contact sheet), edge-print frame numbers and a film rebate with sprocket holes. Pure SVG/CSS, decorative
 * (`aria-hidden`): the state they show is always also carried by text or ARIA on the control itself.
 */

const LOOPS = [
  "M57 5C29 3 5 20 6 50C7 80 30 96 55 95C81 94 96 75 95 47C94 21 73 6 45 9C38 10 33 13 29 17",
  "M42 7C72 1 97 22 94 53C91 83 64 98 40 93C15 88 3 65 7 41C11 19 31 6 58 6C64 6 70 8 75 11",
  "M50 4C24 6 6 26 8 53C10 79 33 95 58 93C82 91 96 70 93 44C90 19 69 4 43 7C37 8 31 11 27 15",
] as const;

const CROSS = ["M16 14C34 34 56 58 85 88", "M84 12C63 36 40 61 15 89"] as const;

function Strokes({ paths, width }: { paths: readonly string[]; width: number }) {
  return paths.map((d) => (
    <g key={d}>
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* A thinner offset pass for the waxy edge of a real grease pencil. */}
      <path
        d={d}
        transform="translate(0.7 0.9)"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth={width * 0.45}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  ));
}

/** A hand-drawn loop stretched over its box (position it with `className`, e.g. `absolute -inset-2`). */
export function PencilCircle({
  variant = 0,
  strokeWidth = 2.6,
  className,
}: {
  variant?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn("pointer-events-none overflow-visible text-safelight-ink", className)}
    >
      <Strokes paths={[LOOPS[Math.abs(variant) % LOOPS.length]]} width={strokeWidth} />
    </svg>
  );
}

/** A hand-drawn ✕ through a rejected frame. */
export function PencilCross({ strokeWidth = 2.6, className }: { strokeWidth?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn("pointer-events-none overflow-visible text-safelight-ink", className)}
    >
      <Strokes paths={CROSS} width={strokeWidth} />
    </svg>
  );
}

/** A dab of grease pencil: an irregular filled dot (favorites). */
export function PencilDot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className={cn("pointer-events-none text-safelight-ink", className)}
    >
      <path
        d="M10.6 2.2C14.9 2.4 18 5.6 17.7 10.2C17.4 14.6 14 17.9 9.6 17.7C5.3 17.5 2.2 14.4 2.4 9.8C2.6 5.4 6.1 2 10.6 2.2Z"
        fill="currentColor"
      />
      <path d="M6.2 5.4C8 4 11.3 3.6 13.4 4.7" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Edge-print frame number: "01", "02"… (1-based). */
export function frameNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/** A short mono date for captions: "25.11.26" (UTC, so server and client agree). */
export function captionDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

/** Sprocket holes as a tiny SVG tile (paper-coloured holes punched in the dark rebate). */
const SPROCKET =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='8'%3E%3Crect x='3.5' y='1' width='7' height='6' rx='1.4' fill='%23e9e2d6' fill-opacity='.78'/%3E%3C/svg%3E\")";

/** A row of sprocket holes (style for a dark `bg-darkroom` band ~12px tall). */
export const sprocketRow: React.CSSProperties = {
  backgroundImage: SPROCKET,
  backgroundRepeat: "repeat-x",
  backgroundPosition: "left center",
  backgroundSize: "14px 8px",
};

/**
 * A strip of 35mm film: a dark rebate with a row of sprocket holes along the top and bottom and optional
 * edge print. Children sit in the frame window between the perforations.
 */
export function FilmStrip({
  children,
  edge,
  className,
  frameClassName,
}: {
  children: React.ReactNode;
  /** Edge print along the bottom rebate, e.g. "OPENSHOOT 400 · ▸ 07". */
  edge?: React.ReactNode;
  className?: string;
  frameClassName?: string;
}) {
  return (
    <div
      className={cn("relative bg-darkroom px-2 py-4 text-darkroom-foreground", className)}
      style={{
        backgroundImage: `${SPROCKET}, ${SPROCKET}`,
        backgroundRepeat: "repeat-x, repeat-x",
        backgroundPosition: "left 3px, left calc(100% - 3px)",
        backgroundSize: "14px 8px, 14px 8px",
      }}
    >
      <div className={cn("relative overflow-hidden", frameClassName)}>{children}</div>
      {edge && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 bottom-[-1px] translate-y-full font-mono text-[9px] leading-none tracking-[0.18em] text-darkroom-muted uppercase"
        >
          {edge}
        </span>
      )}
    </div>
  );
}

/** A tiny proof-sheet glyph: frames in a row, the keepers circled and one crossed out. Decorative. */
export function MiniContactSheet({
  frames = 8,
  keep = [1, 4, 6],
  reject = 2,
  className,
}: {
  frames?: number;
  keep?: readonly number[];
  reject?: number | null;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("grid grid-cols-4 gap-1.5 bg-darkroom p-2", className)}>
      {Array.from({ length: frames }, (_, i) => (
        <div key={i} className="relative">
          <div
            className={cn(
              "aspect-[4/5] bg-darkroom-raised",
              keep.includes(i) ? "bg-[oklch(0.42_0.01_80)]" : i === reject ? "bg-[oklch(0.26_0.008_80)]" : "",
            )}
          />
          <span className="absolute bottom-0.5 left-1 font-mono text-[7px] leading-none text-darkroom-muted">
            {frameNumber(i)}
          </span>
          {keep.includes(i) && (
            <PencilCircle variant={i} strokeWidth={1.6} className="absolute -inset-1 h-[calc(100%+0.5rem)] w-[calc(100%+0.5rem)] text-darkroom-safelight" />
          )}
          {i === reject && <PencilCross strokeWidth={1.4} className="absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)] text-darkroom-safelight" />}
        </div>
      ))}
    </div>
  );
}
