import { ContactSheet, frameNumber, type SheetFrame } from "@/components/marketing/contact-sheet";
import { Folio, SHELL } from "@/components/marketing/editorial";
import { cn } from "@/lib/utils";
import { LIKENESS_GUARANTEE_THRESHOLD } from "@/server/media/scoring";

/** Roll 02 of the illustration: six frames, scores illustrative. */
const ROLL: SheetFrame[] = [
  { setup: "window", hair: "curly", x: -10, score: 0.91, keep: true },
  { setup: "loop", hair: "short", x: 8, flip: true, score: 0.84 },
  { setup: "butterfly", hair: "long", x: 0, tilt: -2, score: 0.88, keep: true },
  { setup: "rim", hair: "bun", x: 10, score: 0.79 },
  { setup: "low-key", hair: "crop", x: -6, flip: true, score: 0.39, reject: true },
  { setup: "rembrandt", hair: "long", x: -12, score: 0.86 },
];
const START = 31;

const STEPS = [
  {
    title: "Scored against your consent selfie",
    body: "After each photo is generated, its face is compared with the live selfie you took when you made your model. That likeness score, plus a check of sharpness and exposure, ranks the set.",
  },
  {
    title: "Best shots first",
    body: "Your strongest frames lead the gallery. Clearly weaker ones from the same set are hidden, not deleted: “Show hidden” brings them back.",
  },
  {
    title: "Below the threshold, refunded",
    body: "If a photo's likeness falls under the threshold, it's hidden and its credits go straight back to your balance. You don't have to ask.",
  },
];

/** The likeness guarantee, told as the contact sheet it is: circle the keepers, cross out the miss. */
export function LikenessProof() {
  const threshold = Math.round(LIKENESS_GUARANTEE_THRESHOLD * 100);
  const scale = (score: number) => `${((score * 100 - 30) / 70) * 100}%`;
  const best = Math.max(...ROLL.map((f) => f.score));
  return (
    <section aria-labelledby="proof-title" className="border-t border-border py-20 sm:py-28 lg:py-36">
      <div className={cn(SHELL, "grid gap-y-14 lg:grid-cols-12 lg:gap-x-10")}>
        <div className="lg:col-span-5">
          <Folio no="02" label="Proof" />
          <h2
            id="proof-title"
            className="mt-6 font-display text-[clamp(2.9rem,8vw,5.5rem)] leading-[0.92] tracking-[-0.03em]"
          >
            Every frame is scored. <span className="block italic">The misses are on us.</span>
          </h2>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-pretty text-muted-foreground">
            An AI photo that doesn&apos;t look like you is worthless, so we measure it and pay for the ones that miss.
            This is the likeness guarantee, in plain terms:
          </p>
          <ol className="mt-10 max-w-[34rem] border-t border-border">
            {STEPS.map((step, i) => (
              <li key={step.title} className="grid grid-cols-[2.5rem_1fr] border-b border-border py-5">
                <span className="mono-caps pt-1 text-safelight-ink">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="font-medium">{step.title}</h3>
                  <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <figure className="lg:col-span-7 lg:pt-16">
          <ContactSheet id="proof-sheet" frames={ROLL} start={START} roll="02" annotate className="rotate-[0.6deg]" />
          {/* The scale under the sheet: where each frame landed, and where the refund line is. */}
          <div aria-hidden="true" className="mt-14 sm:mt-16">
            <div className="relative h-24">
              <div className="absolute inset-x-0 top-12 h-px bg-foreground/40" />
              {Array.from({ length: 15 }, (_, i) => (
                <span
                  key={i}
                  className="absolute top-12 h-2 w-px bg-foreground/40"
                  style={{ left: `${(i / 14) * 100}%` }}
                />
              ))}
              <span className="absolute top-[3.75rem] left-0 mono-caps text-[0.625rem] text-muted-foreground">30%</span>
              <span className="absolute top-[3.75rem] right-0 mono-caps text-[0.625rem] text-muted-foreground">100%</span>
              {/* Refund line. */}
              <span
                className="absolute top-2 bottom-4 border-l-2 border-dashed border-safelight-ink"
                style={{ left: scale(LIKENESS_GUARANTEE_THRESHOLD) }}
              />
              <span
                className="absolute top-0 mono-caps text-[0.625rem] whitespace-nowrap text-safelight-ink"
                style={{ left: `calc(${scale(LIKENESS_GUARANTEE_THRESHOLD)} + 8px)` }}
              >
                Threshold {threshold}%
              </span>
              {ROLL.map((f, i) => (
                <span
                  key={i}
                  className={cn(
                    "absolute top-[2.4rem] size-[11px] -translate-x-1/2 rounded-full border-2",
                    f.reject
                      ? "border-safelight-ink bg-background"
                      : f.keep
                        ? "border-foreground bg-foreground"
                        : "border-foreground bg-background",
                  )}
                  style={{ left: scale(f.score) }}
                />
              ))}
              <span
                className="absolute top-[3.75rem] mono-caps text-[0.625rem] whitespace-nowrap text-safelight-ink"
                style={{ left: scale(ROLL.find((f) => f.reject)!.score), transform: "translateX(-50%)" }}
              >
                Refunded
              </span>
              <span
                className="absolute top-[3.75rem] mono-caps text-[0.625rem] whitespace-nowrap"
                style={{ left: scale(best), transform: "translateX(-60%)" }}
              >
                Best · {frameNumber(START, ROLL.findIndex((f) => f.score === best))}A
              </span>
            </div>
          </div>
          <figcaption className="mono-caps mt-4 leading-relaxed text-muted-foreground">
            Fig. 2 — Illustration. Likeness of each frame against the consent selfie; the dashed line is the refund
            threshold.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
