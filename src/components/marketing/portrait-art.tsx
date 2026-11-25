import { cn } from "@/lib/utils";

/**
 * Monochrome "lighting study" portraits used instead of photos on marketing pages: an abstract
 * head-and-shoulders form lit like a real studio setup (Rembrandt, butterfly, split, rim…), printed in an
 * ink/paper duotone. No image bytes, scales crisply, never depicts a real person. Decorative only.
 *
 * Drawn on a 200×200 canvas with `slice`, so the same study crops cleanly to 3:2 film frames and 4:5 prints.
 */
export type PortraitHair = "short" | "long" | "bun" | "curly" | "crop";

export type LightingSetup =
  "rembrandt" | "loop" | "butterfly" | "split" | "rim" | "window" | "high-key" | "low-key" | "silhouette";

export const LIGHTING_LABEL: Record<LightingSetup, string> = {
  rembrandt: "Rembrandt",
  loop: "Loop light",
  butterfly: "Butterfly",
  split: "Split light",
  rim: "Rim light",
  window: "Window light",
  "high-key": "High key",
  "low-key": "Low key",
  silhouette: "Silhouette",
};

const INK: [number, number, number] = [20, 18, 14];
const PAPER: [number, number, number] = [239, 232, 220];

/** Tone 0 (ink) … 1 (paper) as hex. */
function tone(t: number): string {
  const k = Math.min(1, Math.max(0, t));
  return `#${INK.map((c, i) =>
    Math.round(c + (PAPER[i]! - c) * k)
      .toString(16)
      .padStart(2, "0"),
  ).join("")}`;
}

interface Study {
  /** Backdrop: tone at the light spot, tone at the edges, light spot position/size. */
  bg: [inner: number, outer: number, cx: number, cy: number, r: number];
  /** Unlit skin/clothing tone. */
  base: number;
  /** Key light pooled on the figure: centre, radius, peak opacity. */
  key?: [cx: number, cy: number, r: number, peak: number];
  /** Hard split down the middle of the face (lit side left). */
  split?: number;
  /** Rim/edge light opacity; `both` sides or the lit (left) side only. */
  rim?: [opacity: number, both: boolean];
  /** Rembrandt cheek triangle on the shadow side. */
  triangle?: number;
  /** Shadow under the nose: centred (butterfly) or falling to the shadow side (loop). */
  nose?: "butterfly" | "loop";
  /** Vignette strength. */
  vignette: number;
}

const STUDIES: Record<LightingSetup, Study> = {
  rembrandt: { bg: [0.46, 0.12, 150, 64, 130], base: 0.1, key: [78, 72, 52, 0.88], triangle: 0.32, vignette: 0.45 },
  loop: { bg: [0.56, 0.22, 140, 70, 140], base: 0.16, key: [86, 70, 60, 0.92], nose: "loop", vignette: 0.35 },
  butterfly: { bg: [0.66, 0.3, 100, 58, 120], base: 0.2, key: [100, 66, 62, 0.95], nose: "butterfly", vignette: 0.35 },
  split: { bg: [0.24, 0.05, 60, 90, 120], base: 0.05, split: 0.82, vignette: 0.5 },
  rim: { bg: [0.34, 0.02, 100, 92, 70], base: 0.04, rim: [0.95, true], vignette: 0.55 },
  window: { bg: [0.6, 0.16, 30, 60, 170], base: 0.14, key: [70, 82, 86, 0.78], rim: [0.35, false], vignette: 0.4 },
  "high-key": { bg: [1, 0.88, 100, 80, 150], base: 0.6, key: [92, 70, 80, 0.85], nose: "butterfly", vignette: 0.08 },
  "low-key": { bg: [0.12, 0.02, 70, 60, 110], base: 0.03, key: [80, 66, 30, 0.72], rim: [0.4, false], vignette: 0.6 },
  silhouette: { bg: [0.97, 0.62, 100, 96, 130], base: 0.02, vignette: 0.25 },
};

const HEAD = "M100 55C116 55 126 68 126 86C126 104 115 118 100 118C85 118 74 104 74 86C74 68 84 55 100 55Z";
const NECK = "M88 108L112 108L115 138L85 138Z";
const BODY = "M28 200C31 160 58 138 100 136C142 138 169 160 172 200Z";
/** Outline traced by the rim light (shoulder, neck, head, neck, shoulder). */
const OUTLINE =
  "M34 196C38 162 60 141 86 138L86 112C78 106 74 96 74 86C74 68 84 55 100 55C116 55 126 68 126 86C126 96 122 106 114 112L114 138C140 141 162 162 166 196";

/** Hair drawn behind the head (long, bun) and over it (the cap). */
const HAIR_BACK: Partial<Record<PortraitHair, string>> = {
  long: "M70 98C62 58 82 45 100 45C120 45 138 58 130 98L136 152C124 148 117 140 115 128L85 128C83 140 76 148 64 152Z",
};
const HAIR_CAP: Partial<Record<PortraitHair, string>> = {
  short: "M73 90C68 60 84 49 101 49C120 49 133 61 127 90C123 72 110 66 100 66C88 66 78 72 73 90Z",
  long: "M73 92C69 60 84 48 101 48C120 48 133 60 127 92C121 72 108 64 98 64C86 66 78 74 73 92Z",
  bun: "M74 88C70 61 85 51 101 51C119 51 131 62 126 88C121 71 109 66 100 66C89 66 79 71 74 88Z",
  curly:
    "M70 92C58 78 64 58 78 55C78 41 96 35 106 43C118 35 137 45 132 59C144 65 142 84 130 92C126 74 112 66 100 66C88 66 76 74 70 92Z",
};

export interface PortraitArtProps {
  /** Unique per page: prefixes the gradient ids. */
  id: string;
  setup: LightingSetup;
  hair?: PortraitHair;
  /** Head tilt in degrees (small values, -8..8). */
  tilt?: number;
  /** Horizontal subject offset in canvas units (-40..40), for off-centre landscape frames. */
  x?: number;
  /** Mirror the whole study (key light from the other side). */
  flip?: boolean;
  className?: string;
}

export function PortraitArt({ id, setup, hair = "short", tilt = 0, x = 0, flip = false, className }: PortraitArtProps) {
  const s = STUDIES[setup];
  const [bgIn, bgOut, bcx, bcy, br] = s.bg;
  const hairTone = tone(Math.max(0, s.base - 0.06));
  const figure = (
    <>
      <path d={HEAD} />
      <path d={NECK} />
      <path d={BODY} />
    </>
  );
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
      className={cn("absolute inset-0 size-full", className)}
    >
      <defs>
        <radialGradient id={`${id}-bg`} gradientUnits="userSpaceOnUse" cx={bcx} cy={bcy} r={br}>
          <stop offset="0" stopColor={tone(bgIn)} />
          <stop offset="1" stopColor={tone(bgOut)} />
        </radialGradient>
        {s.key && (
          <radialGradient id={`${id}-key`} gradientUnits="userSpaceOnUse" cx={s.key[0]} cy={s.key[1]} r={s.key[2]}>
            <stop offset="0" stopColor={tone(1)} stopOpacity={s.key[3]} />
            <stop offset="0.55" stopColor={tone(0.9)} stopOpacity={s.key[3] * 0.45} />
            <stop offset="1" stopColor={tone(0.8)} stopOpacity="0" />
          </radialGradient>
        )}
        {s.split !== undefined && (
          <linearGradient id={`${id}-split`} gradientUnits="userSpaceOnUse" x1="40" y1="0" x2="160" y2="0">
            <stop offset="0" stopColor={tone(0.75)} stopOpacity={s.split * 0.6} />
            <stop offset="0.45" stopColor={tone(1)} stopOpacity={s.split} />
            <stop offset="0.5" stopColor={tone(1)} stopOpacity={s.split * 0.85} />
            <stop offset="0.535" stopColor={tone(1)} stopOpacity="0" />
          </linearGradient>
        )}
        {s.rim && (
          <linearGradient id={`${id}-rim`} gradientUnits="userSpaceOnUse" x1="40" y1="0" x2="160" y2="0">
            <stop offset="0" stopColor={tone(1)} stopOpacity={s.rim[0]} />
            <stop offset="0.42" stopColor={tone(1)} stopOpacity={s.rim[0] * 0.5} />
            <stop offset="0.58" stopColor={tone(1)} stopOpacity={s.rim[1] ? s.rim[0] * 0.5 : 0} />
            <stop offset="1" stopColor={tone(1)} stopOpacity={s.rim[1] ? s.rim[0] : 0} />
          </linearGradient>
        )}
        <radialGradient id={`${id}-vig`} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.55" stopColor={tone(0)} stopOpacity="0" />
          <stop offset="1" stopColor={tone(0)} stopOpacity={s.vignette} />
        </radialGradient>
      </defs>
      <g transform={flip ? "matrix(-1 0 0 1 200 0)" : undefined}>
        <rect width="200" height="200" fill={`url(#${id}-bg)`} />
        <g transform={`translate(${x} 0) rotate(${tilt} 100 140)`}>
          {HAIR_BACK[hair] && <path d={HAIR_BACK[hair]} fill={hairTone} />}
          {hair === "bun" && <circle cx="100" cy="47" r="13" fill={hairTone} />}
          <g fill={tone(s.base)}>{figure}</g>
          {s.key && <g fill={`url(#${id}-key)`}>{figure}</g>}
          {s.split !== undefined && <g fill={`url(#${id}-split)`}>{figure}</g>}
          {s.triangle !== undefined && (
            <path
              d="M107 92C111 91 115 91 117 91C115 96 112 100 109 102C108 99 107 95 107 92Z"
              fill={tone(0.9)}
              opacity={s.triangle}
            />
          )}
          {s.nose === "butterfly" && <ellipse cx="100" cy="99" rx="5" ry="2.2" fill={tone(0)} opacity="0.35" />}
          {s.nose === "loop" && <ellipse cx="106" cy="99" rx="5" ry="2.4" fill={tone(0)} opacity="0.3" />}
          {HAIR_CAP[hair] && <path d={HAIR_CAP[hair]} fill={hairTone} />}
          {s.key && HAIR_CAP[hair] && <path d={HAIR_CAP[hair]} fill={`url(#${id}-key)`} opacity="0.45" />}
          {s.rim && (
            <path
              d={OUTLINE}
              fill="none"
              stroke={`url(#${id}-rim)`}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </g>
        <rect width="200" height="200" fill={`url(#${id}-vig)`} />
      </g>
    </svg>
  );
}
