import { GreasePencil } from "@/components/marketing/grease-pencil";
import {
  LIGHTING_LABEL,
  PortraitArt,
  type LightingSetup,
  type PortraitHair,
} from "@/components/marketing/portrait-art";
import { cn } from "@/lib/utils";

export interface SheetFrame {
  setup: LightingSetup;
  hair: PortraitHair;
  x?: number;
  tilt?: number;
  flip?: boolean;
  /** Illustrative likeness score, 0–1. */
  score: number;
  /** Circled in grease pencil as a best shot. */
  keep?: boolean;
  /** Crossed out: below the likeness threshold (hidden, refunded). */
  reject?: boolean;
}

/** "12", "12A"…: edge-print frame numbers. */
export function frameNumber(start: number, i: number): string {
  return String(start + i).padStart(2, "0");
}

/**
 * A black-and-white 35mm proof sheet: strips of film rebate (8 sprocket holes per frame, edge print, frame
 * numbers) printed on paper, with grease-pencil loops around the keepers and an ✕ through the reject.
 * Server-rendered SVG/CSS only. Each cell is a container, so the perforation pitch is exactly 1/8 of a frame
 * at every size, as on real film. `motion`: develop + draw on load (hero) or while scrolling into view.
 */
export function ContactSheet({
  id,
  frames,
  start = 12,
  roll = "01",
  motion = "view",
  annotate = false,
  className,
}: {
  id: string;
  frames: readonly SheetFrame[];
  start?: number;
  roll?: string;
  motion?: "now" | "view";
  /** Write each frame's likeness under it, as an editor would on the sheet. */
  annotate?: boolean;
  className?: string;
}) {
  const now = motion === "now";
  const keepers = frames.flatMap((f, i) => (f.keep ? [i] : []));
  return (
    <div
      className={cn(
        "print-paper @container relative rounded-[2px] p-[3.2%] pb-[2.6%] text-[#16140f] shadow-print",
        !now && "reveal",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="mb-[2.4%] flex items-baseline justify-between gap-3 font-mono text-[clamp(7px,1.9cqw,10px)] tracking-[0.18em] uppercase"
      >
        <span>
          Proof · Roll {roll} · {frames.length} exp.
        </span>
        <span className="hidden min-[360px]:inline">Subject: you</span>
      </div>
      <ol aria-hidden="true" className="grid grid-cols-3 gap-y-[2.2%]">
        {frames.map((f, i) => {
          const n = frameNumber(start, i);
          return (
            <li key={i} className="@container">
              <div className="relative">
                <div className="film relative px-[1.5%] [--hole:4.8cqw] [--pitch:12.5cqw] [--rebate:11.5cqw]">
                  {/* Edge print: outside the perforations, as on 35mm stock. */}
                  <span className="absolute top-[0.9cqw] left-[6cqw] font-mono text-[3.6cqw] leading-none tracking-[0.12em] whitespace-nowrap">
                    {i % 3 === 0 ? `OPENSHOOT 400` : i % 3 === 1 ? "SAFETY FILM" : `◂ ${roll} ▸`}
                  </span>
                  <span className="absolute bottom-[0.9cqw] left-[4cqw] font-mono text-[3.6cqw] leading-none">
                    ▸{n}
                  </span>
                  <span className="absolute right-[18cqw] bottom-[0.9cqw] font-mono text-[3.6cqw] leading-none">
                    {n}A
                  </span>
                  <div
                    className={cn(
                      "grain-over relative aspect-[3/2] overflow-hidden bg-[#2a2620]",
                      now ? "develop-now" : "develop",
                    )}
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <PortraitArt id={`${id}-${i}`} setup={f.setup} hair={f.hair} x={f.x} tilt={f.tilt} flip={f.flip} />
                  </div>
                </div>
                {f.keep && (
                  <GreasePencil
                    mark="circle"
                    variant={(keepers.indexOf(i) % 3) as 0 | 1 | 2}
                    delay={1500 + keepers.indexOf(i) * 380}
                    className={cn(
                      "absolute -inset-x-[7%] top-[5%] z-10 h-[90%] w-[114%] text-[#c0290f]",
                      now && "pencil-now",
                    )}
                  />
                )}
                {f.reject && (
                  <GreasePencil
                    mark="cross"
                    strokeWidth={1.8}
                    delay={1500 + keepers.length * 380}
                    className={cn(
                      "absolute inset-x-[10%] top-[20%] z-10 h-[60%] w-[80%] text-[#c0290f]",
                      now && "pencil-now",
                    )}
                  />
                )}
              </div>
              {annotate && (
                <p
                  className={cn(
                    "mt-[3cqw] flex justify-between px-[3cqw] font-mono text-[max(9px,4.6cqw)] leading-none tracking-[0.08em]",
                    f.reject && "text-[#9e2310]",
                  )}
                >
                  <span>{n}A</span>
                  <span>
                    {Math.round(f.score * 100)}%
                    <span className="hidden @min-[13rem]:inline">
                      {f.reject ? " · refunded" : f.keep ? " · best" : ""}
                    </span>
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <div
        aria-hidden="true"
        className="mt-[2.4%] flex items-center justify-between gap-3 font-mono text-[clamp(7px,1.9cqw,10px)] tracking-[0.16em] uppercase"
      >
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full border-[1.5px] border-[#9e2310]" />
          Best shots
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-sans text-[#9e2310]">✕</span> Below threshold · refunded
        </span>
      </div>
    </div>
  );
}

/**
 * A loupe resting on the sheet: a magnified frame (with its rebate and sprockets) inside a dark rim whose
 * engraving reads the likeness score. Physical object, so it gets the page's one real drop shadow.
 */
export function Loupe({
  id,
  frame,
  label,
  className,
}: {
  id: string;
  frame: SheetFrame;
  /** Frame number shown on the rim, e.g. "16A". */
  label: string;
  className?: string;
}) {
  const ring = `${id}-ring`;
  const text = `Likeness ${Math.round(frame.score * 100)}% · ${label} · ${LIGHTING_LABEL[frame.setup]} · Openshoot loupe 4×`;
  return (
    <div aria-hidden="true" className={cn("pointer-events-none aspect-square", className)}>
      <div className="loupe-glass @container relative size-full overflow-hidden rounded-full bg-[#100e0b]">
        <div className="film absolute inset-x-[-30%] top-1/2 -translate-y-1/2 [--hole:8cqw] [--pitch:17cqw] [--rebate:22cqw]">
          <div className="relative mx-auto aspect-[3/2] w-[86%] overflow-hidden">
            <PortraitArt
              id={`${id}-zoom`}
              setup={frame.setup}
              hair={frame.hair}
              x={frame.x}
              tilt={frame.tilt}
              flip={frame.flip}
            />
          </div>
          <span className="absolute bottom-[1.4cqw] left-[38%] font-mono text-[5cqw] leading-none">{label}</span>
          <span className="absolute top-[1.4cqw] left-[30%] font-mono text-[5cqw] leading-none tracking-[0.12em]">
            OPENSHOOT 400
          </span>
        </div>
        <GreasePencil
          mark="circle"
          variant={1}
          strokeWidth={2.2}
          className="absolute inset-x-[2%] top-[14%] h-[72%] w-[96%] text-[#c0290f]"
        />
        {/* Glass: a soft highlight and a darker edge (lens falloff). */}
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_26%,rgb(255_255_255/0.28),transparent_38%),radial-gradient(circle,transparent_58%,rgb(0_0_0/0.45))]" />
      </div>
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible">
        <defs>
          <path id={ring} d="M100 100m-90.5 0a90.5 90.5 0 1 1 181 0a90.5 90.5 0 1 1-181 0" />
        </defs>
        <circle cx="100" cy="100" r="91" fill="none" stroke="#16140f" strokeWidth="15" />
        <circle cx="100" cy="100" r="83.2" fill="none" stroke="#3b362f" strokeWidth="1.2" />
        <circle cx="100" cy="100" r="98.4" fill="none" stroke="#6b6359" strokeOpacity="0.7" strokeWidth="1.3" />
        <text className="fill-[#e9e2d6] font-mono" fontSize="8.4" letterSpacing="2.1" dominantBaseline="central">
          <textPath href={`#${ring}`} startOffset="1%">
            {text.toUpperCase()}
          </textPath>
        </text>
      </svg>
    </div>
  );
}
