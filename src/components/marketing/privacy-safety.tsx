import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { RegistrationMark, SHELL } from "@/components/marketing/editorial";
import { TRAINING } from "@/config/app";
import { cn } from "@/lib/utils";

const RULES = [
  {
    title: "Only you can train on your face",
    body: "Every model starts with a live camera selfie and a head-turn check. Every training photo must match that face, so nobody can build a model of you from your Instagram.",
  },
  {
    title: "Private by default",
    body: "Your model is yours alone. We never use your photos, models or results to train general AI models, and we never sell them.",
  },
  {
    title: "Adults only",
    body: `Every training photo and every face in every result is age-checked. Anything that may show someone under ${TRAINING.minAge} is blocked.`,
  },
  {
    title: "No sexual content, ever",
    body: "Prompts, uploads and results are checked before anything is stored. Blocked results are discarded and refunded. There's no setting that turns this off.",
  },
  {
    title: "Labelled as AI",
    body: "Every image and video carries standard AI-content metadata that platforms can detect. Free-plan images also get a visible watermark.",
  },
  {
    title: "Real deletion",
    body: "Deleting a model removes your selfies, face data and model weights, including the copy at the AI provider. Account deletion is confirmed by email.",
  },
] as const;

const link =
  "inline-flex min-h-11 items-center gap-2 font-medium underline decoration-darkroom-safelight/60 underline-offset-[5px] transition-colors hover:decoration-darkroom-safelight sm:min-h-0";

/**
 * Privacy and safety as the darkroom's posted rules: an always-dark band lit by a faint safelight, the
 * rules set like a lab notice. Static server markup.
 */
export function PrivacySafety() {
  return (
    <section
      aria-labelledby="safety-title"
      className="grain relative overflow-hidden border-y border-darkroom-line bg-darkroom py-20 text-darkroom-foreground sm:py-28 lg:py-36"
    >
      {/* The safelight: a lamp above the bench, and the red cast it throws. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70%] bg-[radial-gradient(ellipse_60%_100%_at_70%_0%,color-mix(in_oklab,var(--darkroom-safelight)_20%,transparent),transparent_70%)]"
      />
      <div className={cn(SHELL, "grid gap-y-14 lg:grid-cols-12 lg:gap-x-10")}>
        <div className="flex flex-col items-start lg:col-span-5">
          <p className="mono-caps flex items-center gap-3 text-darkroom-muted">
            <span className="text-darkroom-foreground">No. 04</span>
            <span aria-hidden="true" className="h-px w-10 bg-current opacity-40" />
            <span>Privacy &amp; safety</span>
          </p>
          <h2
            id="safety-title"
            className="mt-6 font-display text-[clamp(3.4rem,15vw,6.5rem)] leading-[0.9] tracking-[-0.03em]"
          >
            Your face. <span className="block italic">Your rules.</span>
          </h2>
          <p className="mt-6 max-w-[30rem] text-lg leading-relaxed text-pretty text-darkroom-muted">
            An AI model of your face is personal. Consent, age and content checks are a core part of the app, on every
            plan and on every self-hosted server.
          </p>
          <div className="mt-8 flex flex-col gap-3 text-[15px]">
            <Link href="/legal/privacy" className={link}>
              Read the privacy policy
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
            <Link href="/docs#safety" className={link}>
              How the safety checks work
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>

        {/* The notice pinned on the darkroom door. */}
        <div className="relative lg:col-span-7">
          <div className="border border-darkroom-line bg-darkroom-raised/60">
            <div className="flex items-center justify-between gap-4 border-b border-darkroom-line px-5 py-4 sm:px-7">
              <p className="mono-caps text-darkroom-foreground">Darkroom rules</p>
              <p className="mono-caps flex items-center gap-2 text-darkroom-safelight">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-darkroom-safelight shadow-[0_0_10px_var(--darkroom-safelight)]"
                />
                Always on
              </p>
            </div>
            <ol className="grid sm:grid-cols-2">
              {RULES.map((rule, i) => (
                <li
                  key={rule.title}
                  className={cn(
                    "border-darkroom-line px-5 py-6 sm:px-7 sm:py-7",
                    i > 0 && "border-t",
                    i === 1 && "sm:border-t-0",
                    i % 2 === 1 && "sm:border-l",
                  )}
                >
                  <p className="font-mono text-sm text-darkroom-safelight tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-3 font-display text-[1.75rem] leading-[1.05] tracking-[-0.01em]">{rule.title}</h3>
                  <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-pretty text-darkroom-muted">{rule.body}</p>
                </li>
              ))}
            </ol>
            <p className="mono-caps border-t border-darkroom-line px-5 py-4 leading-relaxed text-darkroom-muted sm:px-7">
              Posted by the lab · no setting turns these off
            </p>
          </div>
          <RegistrationMark className="absolute -top-2.5 -right-2.5 text-darkroom-muted" />
          <RegistrationMark className="absolute -bottom-2.5 -left-2.5 text-darkroom-muted" />
        </div>
      </div>
    </section>
  );
}
