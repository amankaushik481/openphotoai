/**
 * The sign-in "print": the form sits on a sheet of paper with a strip of film along its top edge, as if
 * pulled from a contact sheet, and the little frames develop from negative once when the page opens.
 * Server component (the strip is static SVG); pass client forms as children.
 */
import { GreasePencil } from "@/components/marketing/grease-pencil";
import { StudyFrame, type Study } from "@/components/marketing/pack-print";
import { cn } from "@/lib/utils";

const STRIP: Study[] = [
  { setup: "window", hair: "long", x: 10, tilt: 2, flip: false },
  { setup: "loop", hair: "short", x: -6, tilt: 0, flip: true },
  { setup: "butterfly", hair: "bun", x: 4, tilt: -2, flip: false },
  { setup: "rim", hair: "crop", x: -8, tilt: 0, flip: false },
];

export type StripMark = "keep" | "reject" | "none";

/**
 * A short strip of 35mm film: sprockets, edge print, four lighting studies and one grease-pencil mark (a
 * keeper circled, or a reject crossed out). Decorative.
 */
export function ContactStrip({
  frame = "01",
  mark = "keep",
  className,
}: {
  frame?: string;
  mark?: StripMark;
  className?: string;
}) {
  const n = Number.parseInt(frame, 10) || 1;
  return (
    <div
      aria-hidden="true"
      className={cn("film relative flex gap-1.5 px-2 [--hole:6px] [--pitch:11px] [--rebate:24px]", className)}
    >
      <span className="absolute top-[2px] left-3 font-mono text-[7px] leading-none tracking-[0.16em] whitespace-nowrap">
        OPENSHOOT 400 · SAFETY FILM
      </span>
      <span className="absolute top-[2px] right-3 font-mono text-[7px] leading-none tracking-[0.16em]">
        ◂ {frame} ▸
      </span>
      {STRIP.map((study, i) => (
        <div key={i} className="relative min-w-0 flex-1">
          <div className="develop-now" style={{ "--i": i } as React.CSSProperties}>
            <StudyFrame id={`strip-${frame}-${i}`} study={study} className="aspect-[3/2]" />
          </div>
          <span className="absolute -bottom-[21px] left-0.5 font-mono text-[7px] leading-none">
            ▸{String(n + i).padStart(2, "0")}
          </span>
          {mark === "keep" && i === 1 && (
            <GreasePencil
              mark="circle"
              variant={1}
              delay={1400}
              strokeWidth={2.2}
              className="pencil-now absolute -inset-x-[8%] -top-[14%] z-10 h-[128%] w-[116%]"
            />
          )}
          {mark === "reject" && i === 2 && (
            <GreasePencil
              mark="cross"
              delay={1400}
              strokeWidth={2.2}
              className="pencil-now absolute inset-x-[14%] top-[12%] z-10 h-[76%] w-[72%]"
            />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Paper sheet for the account pages: the contact strip on top, the content below, and an optional mono
 * caption under the sheet like a print's lab label.
 */
export function PrintSheet({
  children,
  frame = "01",
  caption,
  strip = true,
  mark = "keep",
  className,
}: {
  children: React.ReactNode;
  /** Grease-pencil mark on the strip: a circled keeper (default), a crossed-out reject, or none. */
  mark?: StripMark;
  /** Frame number in the edge print and caption. */
  frame?: string;
  caption?: React.ReactNode;
  /** Show the film strip on top (off for plain notices). */
  strip?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="overflow-hidden rounded-[3px] bg-card text-card-foreground shadow-print ring-1 ring-foreground/10">
        {strip && <ContactStrip frame={frame} mark={mark} />}
        <div className="px-5 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-8">{children}</div>
      </div>
      {caption && (
        <p className="mono-caps mt-3 flex items-baseline justify-between gap-4 text-muted-foreground">
          <span>{caption}</span>
          <span aria-hidden="true">{frame}A</span>
        </p>
      )}
    </div>
  );
}
