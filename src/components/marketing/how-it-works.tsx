import { Folio, SHELL } from "@/components/marketing/editorial";
import { GreasePencil } from "@/components/marketing/grease-pencil";
import { PortraitArt, type LightingSetup, type PortraitHair } from "@/components/marketing/portrait-art";
import { TRAINING } from "@/config/app";
import { CREDIT_COSTS } from "@/config/credits";
import { formatCreditCost } from "@/content/credit-costs";
import { cn } from "@/lib/utils";

interface Step {
  word: string;
  title: string;
  body: string;
  /** Darkroom-timer readout and what it means. */
  timer: string;
  timerNote: string;
  art: { setup: LightingSetup; hair: PortraitHair; x: number; tilt?: number };
  /** How the frame is shown on the strip. */
  stage: "viewfinder" | "negative" | "print";
}

const STEPS: Step[] = [
  {
    word: "Expose",
    title: "A live selfie, then your photos",
    body: `A quick camera selfie with a head turn proves it's you. Then add ${TRAINING.minPhotos}–${TRAINING.maxPhotos} photos (3–10 for Instant). The quality checker flags blurry, dark or group shots, with a fix for each, before you spend anything.`,
    timer: "≈ 02:00",
    timerNote: "About two minutes",
    art: { setup: "loop", hair: "short", x: 0, tilt: -2 },
    stage: "viewfinder",
  },
  {
    word: "Develop",
    title: "Your private model",
    body: `Instant models are ready in seconds and free to create. Trained models take a few minutes for ${formatCreditCost(CREDIT_COSTS.train)} and give the best likeness. Only you can use yours, and you can delete it any time.`,
    timer: "< 01:00",
    timerNote: "Instant. Trained: a few minutes, we email you",
    art: { setup: "rembrandt", hair: "long", x: 6 },
    stage: "negative",
  },
  {
    word: "Print",
    title: "Shoot anything, keep the best",
    body: "Pick a pack or describe the shot. Preview free drafts, print the keepers at full quality, then edit, upscale or animate them. Best shots come first; the ones that miss on likeness are refunded.",
    timer: formatCreditCost(CREDIT_COSTS.generateDraft).toUpperCase(),
    timerNote: `Drafts. Full quality from ${formatCreditCost(CREDIT_COSTS.generateStandard)}`,
    art: { setup: "butterfly", hair: "bun", x: -4, tilt: 2 },
    stage: "print",
  },
];

/** Process, told as the darkroom: one strip of film, three frames, Expose → Develop → Print. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="overflow-x-clip py-20 sm:py-28 lg:py-36">
      <div className={cn(SHELL, "grid gap-y-6 lg:grid-cols-12 lg:gap-x-10")}>
        <Folio no="01" label="Process" className="lg:col-span-12" />
        <h2
          id="how-title"
          className="font-display text-[clamp(3rem,11vw,7.5rem)] leading-[0.9] tracking-[-0.03em] lg:col-span-8"
        >
          Expose. Develop. <span className="italic">Print.</span>
        </h2>
        <p className="max-w-[30rem] text-lg leading-relaxed text-pretty text-muted-foreground lg:col-span-4 lg:self-end lg:pb-3">
          Three steps from your camera roll to photos you&apos;d actually post. No studio, no photographer, no week-long
          wait.
        </p>
      </div>

      <div className={cn(SHELL, "relative mt-14 sm:mt-20")}>
        {/* Phones: the strip scrolls sideways, one frame at a time. */}
        <div
          role="region"
          aria-label="The three steps"
          tabIndex={0}
          className="-mx-4 snap-x snap-mandatory overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
        >
          <ol className="grid w-max grid-cols-[repeat(3,min(82vw,26rem))] lg:w-auto lg:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.word} className="reveal snap-start scroll-ml-4 sm:scroll-ml-8">
                <FilmFrame step={step} index={i} />
                <div className="mt-8 grid grid-cols-[2.25rem_1fr] gap-x-3 pr-6 sm:pr-10">
                  <span className="mono-caps pt-3 text-safelight-ink">0{i + 1}</span>
                  <div>
                    <h3 className="font-display text-[2.75rem] leading-none tracking-[-0.02em] sm:text-5xl">
                      {step.word}
                    </h3>
                    <p className="mt-3 font-medium">{step.title}</p>
                    <p className="mt-2 max-w-[34ch] text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">
                      {step.body}
                    </p>
                    <p className="mt-6 flex items-baseline gap-3 border-t border-border pt-4">
                      <span className="font-mono text-2xl leading-none font-medium whitespace-nowrap tabular-nums">
                        {step.timer}
                      </span>
                      <span className="mono-caps text-[0.625rem] text-muted-foreground">{step.timerNote}</span>
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        {/* The roll runs on past the page edge: a blank, fogged frame. */}
        <div
          aria-hidden="true"
          className="@container absolute top-0 left-[calc(100%-3rem)] hidden w-[min(30vw,26rem)] lg:block"
        >
          <div className="film [--hole:4.2cqw] [--pitch:12.5cqw] [--rebate:10cqw]">
            <div className="aspect-[3/2] bg-[radial-gradient(ellipse_at_30%_40%,#3a332b,#16130f_70%)]" />
          </div>
        </div>
      </div>
    </section>
  );
}

function FilmFrame({ step, index }: { step: Step; index: number }) {
  return (
    <div aria-hidden="true" className="@container relative">
      <div className="film relative px-[2px] [--hole:4.2cqw] [--pitch:12.5cqw] [--rebate:10cqw]">
        <span className="absolute top-[1.1cqw] left-[5cqw] font-mono text-[2.6cqw] leading-none tracking-[0.14em]">
          OPENSHOOT 400 · SAFETY FILM
        </span>
        <span className="absolute bottom-[1.1cqw] left-[5cqw] font-mono text-[2.6cqw] leading-none tracking-[0.14em]">
          ▸ 0{index + 1} {step.word.toUpperCase()}
        </span>
        <span className="absolute right-[6cqw] bottom-[1.1cqw] font-mono text-[2.6cqw] leading-none">
          0{index + 1}A
        </span>
        <div className={cn("grain-over relative aspect-[3/2] overflow-hidden", step.stage !== "negative" && "develop")}>
          <div className={cn("absolute inset-0", step.stage === "negative" && "invert-[0.92] sepia-[0.25]")}>
            <PortraitArt id={`process-${index}`} {...step.art} />
          </div>
          {step.stage === "viewfinder" && <Viewfinder />}
          {step.stage === "negative" && <DevelopReadout />}
          {step.stage === "print" && (
            <GreasePencil
              mark="circle"
              variant={2}
              strokeWidth={1.2}
              className="absolute inset-x-[18%] inset-y-[6%] h-[88%] w-[64%] text-[#e2482c]"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Camera UI over the first frame: crop brackets, a live tag and the head-turn prompt. */
function Viewfinder() {
  return (
    <div className="absolute inset-[7%] text-[#efe8dc]">
      <svg viewBox="0 0 100 66" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <path
          d="M0 12V0h12M88 0h12v12M100 54v12H88M12 66H0V54"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
        />
        <ellipse
          cx="50"
          cy="31"
          rx="13"
          ry="17"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.7"
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="absolute top-[4%] left-[4%] flex items-center gap-[1.2cqw] font-mono text-[2.8cqw] tracking-[0.14em]">
        <span className="size-[1.6cqw] rounded-full bg-[#ec4d33]" />
        LIVE
      </span>
      <span className="absolute right-[4%] bottom-[5%] font-mono text-[2.8cqw] tracking-[0.14em]">TURN LEFT ←</span>
    </div>
  );
}

/** Progress readout over the negative. */
function DevelopReadout() {
  return (
    <div className="absolute inset-x-[7%] bottom-[8%] font-mono text-[2.8cqw] tracking-[0.14em] text-[#16140f]">
      <div className="flex justify-between">
        <span>DEVELOPING · MODEL</span>
        <span>72%</span>
      </div>
      <div className="mt-[1.4cqw] h-[0.9cqw] bg-[#16140f]/20">
        <div className="h-full w-[72%] bg-[#c0290f]" />
      </div>
    </div>
  );
}
