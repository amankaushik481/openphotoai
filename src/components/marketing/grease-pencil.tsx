import { cn } from "@/lib/utils";

/**
 * Red grease-pencil marks, as an editor would make on a contact sheet: a quick loop around a keeper, an
 * ✕ through a reject, an underline. Hand-drawn paths (overshooting, never a perfect circle) plus a thinner
 * offset pass for the waxy edge. Marks are part of the print, so they scale with their box; `strokeWidth`
 * is in the mark's own units (100 across).
 *
 * The draw-on (globals.css `.pencil`) runs on load inside `.pencil-now`, follows scrolling inside `.reveal`,
 * and is skipped under reduced motion. Decorative.
 */
const MARKS = {
  circle: {
    box: "0 0 100 100",
    paths: [
      ["M57 5C29 3 5 20 6 50C7 80 30 96 55 95C81 94 96 75 95 47C94 21 73 6 45 9C38 10 33 13 29 17"],
      ["M42 7C72 1 97 22 94 53C91 83 64 98 40 93C15 88 3 65 7 41C11 19 31 6 58 6C64 6 70 8 75 11"],
      ["M50 4C24 6 6 26 8 53C10 79 33 95 58 93C82 91 96 70 93 44C90 19 69 4 43 7C37 8 31 11 27 15"],
    ],
  },
  cross: { box: "0 0 100 100", paths: [["M16 14C34 34 56 58 85 88", "M84 12C63 36 40 61 15 89"]] },
  underline: { box: "0 0 100 14", paths: [["M1 7C25 4 52 3 99 6C80 7 62 9 46 11"]] },
} as const;

export type PencilMark = keyof typeof MARKS;

export function GreasePencil({
  mark,
  variant = 0,
  delay = 0,
  strokeWidth = 1.6,
  className,
}: {
  mark: PencilMark;
  /** Which hand-drawn loop (circle only). */
  variant?: 0 | 1 | 2;
  /** Draw-on delay in ms (on-load marks). */
  delay?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const { box, paths } = MARKS[mark];
  const strokes: readonly string[] = (mark === "circle" ? paths[variant] : paths[0]) ?? [];
  return (
    <svg
      viewBox={box}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn("pencil pointer-events-none overflow-visible text-safelight-ink", className)}
      style={{ "--pencil-delay": `${delay}ms` } as React.CSSProperties}
    >
      {strokes.map((d, i) => (
        <g key={d} style={{ "--pencil-i": i } as React.CSSProperties}>
          <path
            d={d}
            pathLength={1}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={d}
            pathLength={1}
            transform="translate(0.5 0.6)"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.4"
            strokeWidth={strokeWidth * 0.4}
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  );
}
