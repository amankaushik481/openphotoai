/**
 * A strip of three frames with the middle one ruined, for the 404 and error pages: blown out to white
 * ("overexposed": the page you wanted isn't on this roll) or fogged grey ("fogged": something went wrong
 * while developing). Hook-free, so the client error view can use it too. Decorative.
 */
import { GreasePencil } from "@/components/marketing/grease-pencil";
import { StudyFrame, type Study } from "@/components/marketing/pack-print";
import { cn } from "@/lib/utils";

const BEFORE: Study = { setup: "loop", hair: "short", x: 8, tilt: -2, flip: false };
const AFTER: Study = { setup: "rembrandt", hair: "long", x: -8, tilt: 2, flip: true };

export function LostFrame({
  variant,
  frame,
  className,
}: {
  variant: "overexposed" | "fogged";
  /** Frame number of the lost frame, e.g. "404". */
  frame: string;
  className?: string;
}) {
  const n = Number.parseInt(frame, 10);
  const label = (k: number) => (Number.isFinite(n) ? String(n + k) : frame);
  return (
    <div aria-hidden="true" className={cn("overflow-hidden", className)}>
      <div className="film relative flex w-[150%] -translate-x-[16.66%] gap-2 px-2 [--hole:8px] [--pitch:15px] [--rebate:32px] sm:w-[130%] sm:-translate-x-[11.5%]">
        {[-1, 0, 1].map((k) => (
          <div key={k} className="relative min-w-0 flex-1">
            <span className="absolute inset-x-1 -top-[30px] truncate font-mono text-[9px] leading-none tracking-[0.16em]">
              {k === 0 ? "OPENSHOOT 400 · SAFETY FILM" : "OPENSHOOT 400"}
            </span>
            {k === 0 ? (
              variant === "overexposed" ? (
                <div className="print-paper grain-over relative aspect-[3/2] overflow-hidden">
                  {/* A ghost of the sitter, almost burnt away. */}
                  <StudyFrame
                    id={`lost-${frame}`}
                    study={{ setup: "high-key", hair: "short", x: 0, tilt: 0, flip: false }}
                    className="absolute inset-0 opacity-[0.16] [filter:brightness(1.5)_contrast(0.6)]"
                  />
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,#fffdf8_10%,transparent_75%)] dark:opacity-40" />
                </div>
              ) : (
                <div className="grain-over relative aspect-[3/2] overflow-hidden bg-[#77706a]">
                  <StudyFrame
                    id={`fog-${frame}`}
                    study={{ setup: "low-key", hair: "short", x: 0, tilt: 0, flip: false }}
                    className="absolute inset-0 opacity-30 mix-blend-multiply"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgb(238_231_219/0.35)_50%,transparent_65%)]" />
                </div>
              )
            ) : (
              <StudyFrame id={`strip-${frame}-${k}`} study={k < 0 ? BEFORE : AFTER} className="aspect-[3/2]" />
            )}
            {k === 0 && (
              <GreasePencil
                mark={variant === "overexposed" ? "circle" : "cross"}
                variant={2}
                delay={600}
                strokeWidth={variant === "overexposed" ? 1.1 : 2}
                className={cn(
                  "pencil-now absolute z-10",
                  variant === "overexposed"
                    ? "-inset-x-[6%] -top-[12%] h-[124%] w-[112%]"
                    : "inset-x-[18%] top-[14%] h-[72%] w-[64%]",
                )}
              />
            )}
            <span className="absolute -bottom-[30px] left-1 font-mono text-[10px] leading-none">▸{label(k)}</span>
            <span className="absolute right-6 -bottom-[30px] font-mono text-[10px] leading-none">{label(k)}A</span>
          </div>
        ))}
      </div>
    </div>
  );
}
