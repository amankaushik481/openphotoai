import { cn } from "@/lib/utils";

/**
 * Abstract, backlit head-and-shoulders silhouette used instead of photos on marketing pages
 * (no image bytes, scales crisply, never depicts a real person). Decorative only.
 */
export type PortraitHair = "short" | "long" | "bun" | "curly";

const HAIR: Record<PortraitHair, string> = {
  short: "M52 84 C48 54 64 44 81 44 C100 44 112 56 108 84 C102 66 72 62 52 84 Z",
  long: "M49 86 C44 50 63 40 80 40 C99 40 116 52 111 88 L116 146 C104 140 97 132 95 122 L65 122 C63 132 56 140 44 146 Z",
  bun: "M52 84 C48 54 64 44 81 44 C100 44 112 56 108 84 C102 66 72 62 52 84 Z",
  curly:
    "M50 82 C40 70 46 54 58 52 C58 40 74 34 84 40 C94 32 112 40 110 54 C122 60 120 76 110 84 C104 68 70 62 50 82 Z",
};

export interface PortraitArtProps {
  hair?: PortraitHair;
  /** Head tilt in degrees (small values, -8..8). */
  tilt?: number;
  /** Horizontal key-light position in the 0..160 viewBox. */
  light?: number;
  className?: string;
}

export function PortraitArt({ hair = "short", tilt = 0, light = 40, className }: PortraitArtProps) {
  const rimSide = light < 80 ? -1 : 1;
  return (
    <svg
      viewBox="0 0 160 200"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMax slice"
      className={cn("absolute inset-0 size-full", className)}
    >
      <circle cx={light} cy="36" r="92" fill="#fff" opacity="0.2" />
      <circle cx={light} cy="36" r="46" fill="#fff" opacity="0.14" />
      <g transform={`rotate(${tilt} 80 136)`}>
        <g fill="#0b0712" opacity="0.4">
          <path d={HAIR[hair]} />
          {hair === "bun" && <circle cx="80" cy="38" r="12" />}
          <ellipse cx="80" cy="86" rx="27" ry="33" />
          <path d="M69 108 h22 v30 h-22 Z" />
          <path d="M14 200 C18 158 48 136 80 136 C112 136 142 158 146 200 Z" />
        </g>
        {/* Rim light on the side facing the key light. */}
        <path
          d={rimSide < 0 ? "M55 72 C51 84 54 100 63 110" : "M105 72 C109 84 106 100 97 110"}
          fill="none"
          stroke="#fff"
          strokeOpacity="0.6"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d={rimSide < 0 ? "M22 196 C26 166 44 148 64 142" : "M138 196 C134 166 116 148 96 142"}
          fill="none"
          stroke="#fff"
          strokeOpacity="0.45"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
