import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";

import { DemoLoginButton } from "@/components/demo/demo-login-button";
import { GithubIcon } from "@/components/layout/icons";
import { ContactSheet, Loupe, frameNumber, type SheetFrame } from "@/components/marketing/contact-sheet";
import { GreasePencil } from "@/components/marketing/grease-pencil";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { CREDIT_COSTS } from "@/config/credits";
import { formatCreditCost } from "@/content/credit-costs";

/** Roll 01: twelve lighting studies of one (abstract) sitter. Scores are illustrative. */
const ROLL: SheetFrame[] = [
  { setup: "rembrandt", hair: "short", x: -16, tilt: -3, score: 0.86 },
  { setup: "window", hair: "long", x: 14, tilt: 2, score: 0.88, keep: true },
  { setup: "split", hair: "crop", x: -4, score: 0.79 },
  { setup: "butterfly", hair: "bun", x: -8, tilt: 2, score: 0.9, keep: true },
  { setup: "loop", hair: "long", x: 14, flip: true, score: 0.84 },
  { setup: "low-key", hair: "short", x: -12, score: 0.74 },
  { setup: "silhouette", hair: "curly", x: 12, score: 0.38, reject: true },
  { setup: "rim", hair: "short", x: 0, score: 0.77 },
  { setup: "high-key", hair: "long", x: -14, tilt: -2, score: 0.83 },
  { setup: "rembrandt", hair: "curly", flip: true, x: 10, score: 0.85 },
  { setup: "window", hair: "bun", flip: true, x: -6, score: 0.81 },
  { setup: "loop", hair: "short", x: 8, tilt: 2, score: 0.92, keep: true },
];
const START = 12;
const LOUPE = 11;

export function Hero() {
  const kept = ROLL.filter((f) => !f.reject).length;
  const best = ROLL.filter((f) => f.keep).length;
  return (
    <section aria-labelledby="hero-title" className="grain relative overflow-x-clip">
      <div className="mx-auto grid max-w-[90rem] gap-x-10 gap-y-14 px-4 pt-10 pb-16 sm:px-8 sm:pt-14 lg:grid-cols-12 lg:px-12 lg:pt-16 lg:pb-20">
        <div className="flex flex-col lg:col-span-7 lg:pt-4">
          <p className="mono-caps flex items-center gap-2.5 text-muted-foreground">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-safelight-ink" />
            {APP.tagline}
          </p>
          <h1
            id="hero-title"
            className="mt-6 font-display text-[clamp(3.6rem,19vw,5.5rem)] leading-[0.86] tracking-[-0.035em] sm:text-[clamp(5rem,10.4vw,9.75rem)]"
          >
            Portraits that look like{" "}
            <span className="relative inline-block pr-[0.06em] italic">
              you.
              <GreasePencil
                mark="underline"
                delay={900}
                strokeWidth={2.4}
                className="pencil-now absolute -bottom-[0.04em] left-[-0.04em] h-[0.16em] w-[1.12em]"
              />
            </span>
          </h1>
          <p className="mt-7 max-w-[33rem] text-[1.0625rem] leading-relaxed text-pretty sm:mt-8 sm:text-xl sm:leading-relaxed">
            Take a live selfie and add a few photos. {APP.name} learns your face, then shoots headshots, dating, travel
            and editorial portraits. Every frame is scored against your selfie; the ones that miss are refunded.
          </p>
          <div className="mt-9 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
            <Button asChild variant="brand" size="lg" className="h-12 rounded-[3px] px-6 text-[15px] sm:w-auto">
              <Link href="/login">
                Start shooting
                <span aria-hidden="true" className="h-4 w-px bg-white/40" />
                <span className="font-normal">free drafts</span>
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </Button>
            {/* The demo link appears after its probe; it comes last so nothing moves when it does. */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px]">
              <a
                href={APP.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 font-medium underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-safelight-ink sm:min-h-0"
              >
                <GithubIcon className="size-4" />
                Self-host on GitHub
                <ArrowUpRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <DemoLoginButton
                probe
                variant="ghost"
                label="Try the demo"
                className="h-auto min-h-11 w-auto px-0 text-[15px] font-medium underline decoration-foreground/25 underline-offset-[5px] hover:bg-transparent hover:decoration-safelight-ink sm:min-h-0 dark:hover:bg-transparent [&_svg]:size-3.5"
              />
            </div>
          </div>
          <p className="mono-caps mt-7 leading-relaxed text-muted-foreground sm:mt-8">
            Free drafts <span aria-hidden="true">·</span> From {formatCreditCost(CREDIT_COSTS.generateStandard)} a photo{" "}
            <span aria-hidden="true">·</span> Credits never expire
          </p>
        </div>

        <figure className="relative mx-auto w-full max-w-[34rem] lg:col-span-5 lg:mt-2 lg:max-w-none">
          <div className="relative rotate-[-1.4deg] lg:rotate-[-1.8deg]">
            <ContactSheet id="hero-sheet" frames={ROLL} start={START} motion="now" />
            {/* Over the last frame, hanging off the sheet's corner onto the table. */}
            <Loupe
              id="hero-loupe"
              frame={ROLL[LOUPE]!}
              label={`${frameNumber(START, LOUPE)}A`}
              className="absolute right-[-4%] bottom-[-7%] w-[40%] rotate-[1.8deg] drop-shadow-[0_22px_22px_rgb(0_0_0/0.35)] sm:right-[-8%]"
            />
          </div>
          <figcaption className="mono-caps mt-8 max-w-[62%] leading-relaxed text-muted-foreground sm:mt-10">
            Fig. 1 — Illustration, not real output. Roll of {ROLL.length}: {kept} kept, {best} circled as best shots, 1
            below the likeness threshold, hidden and refunded.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
