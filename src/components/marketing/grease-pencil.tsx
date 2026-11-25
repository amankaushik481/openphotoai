import { cn } from "@/lib/utils";

/**
 * Red grease-pencil marks, as an editor would make on a contact sheet: a quick loop around a keeper, an
 * ✕ through a reject, an underline. Hand-drawn paths (overshooting, never a perfect circle) stretched to
 * their box with non-scaling strokes, plus a thinner offset pass for the waxy edge.
 *
 * The draw-on animation lives in globals.css (`.pencil`): it runs once when its `[data-reveal]` ancestor
 * scrolls into view (or on load with `pencil-now`), and is skipped under reduced motion. Decorative.
 */
const PATHS = {
  circle: [
    "M57 5C29 3 5 20 6 50C7 80 30 96 55 95C81 94 96 75 95 47C94 21 73 6 45 9C38 10 33 13 29 17",
    "M42 7C72 1 97 22 94 53C91 83 64 98 40 93C15 88 3 65 7 41C11 19 31 6 58 6C64 6 70 8 75 11",
    "M50 4C24 6 6 26 8 53C10 79 33 95 58 93C82 91 96 70 93 44C90 19 69 4 43 7C37 8 31 11 27 15",
  ],
  cross: ["M16 14C34 34 56 58 85 88", "M84 12C63 36 40 61 15 89"],
  underline: ["M1 6C25 3 52 2 99 5C80 6 60 8 44 10"],
  tick: ["M8 54C18 62 26 72 34 86C48 54 68 28 94 8"],
} as const;

export type PencilMark = "circle" | "cross" | "underline" | "tick";

export function GreasePencil({
  mark,
  variant = 0,
  delay = 0,
  className,
  strokeWidth = 2.6,
}: {
  mark: PencilMark;
  /** Which hand-drawn loop (circle only). */
  variant?: 0 | 1 | 2;
  /** Animation delay in ms. */
  delay?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const paths = mark === "circle" ? [PATHS.circle[variant]] : PATHS[mark];
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn("pencil pointer-events-none overflow-visible text-safelight-ink", className)}
      style={{ "--pencil-delay": `${delay}ms` } as React.CSSProperties}
    >
      {paths.map((d, i) => (
        <g key={d} style={{ "--pencil-i": i } as React.CSSProperties}>
          <path
            d={d}
            pathLength={1}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={d}
            pathLength={1}
            transform="translate(0.7 0.9)"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.45"
            strokeWidth={strokeWidth * 0.45}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
    </svg>
  );
}
