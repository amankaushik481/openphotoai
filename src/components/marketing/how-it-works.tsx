import { CameraIcon, CpuIcon, SparklesIcon } from "lucide-react";

import { MarketingSection, SectionHeading } from "@/components/marketing/section-heading";
import { TRAINING } from "@/config/app";
import { CREDIT_COSTS } from "@/config/credits";

const STEPS = [
  {
    icon: CameraIcon,
    title: "Take a live selfie, add your photos",
    body: `A quick camera selfie proves it's you. Then add ${TRAINING.minPhotos}–${TRAINING.maxPhotos} photos (3–10 for Instant). The quality checker flags blurry, dark or group shots and tells you how to fix them before you spend anything.`,
    meta: "About 2 minutes",
  },
  {
    icon: CpuIcon,
    title: "We build your private model",
    body: `Instant models are ready in seconds and free to create. Trained models take a few minutes for ${CREDIT_COSTS.train} credits and give the best likeness. Only you can use your model, and you can delete it any time.`,
    meta: "Seconds to minutes",
  },
  {
    icon: SparklesIcon,
    title: "Shoot anything",
    body: "Pick a pack or describe the shot. Preview free drafts, render the keepers in full quality, then edit, upscale or animate them. Best shots come first; weak ones are refunded.",
    meta: `From ${CREDIT_COSTS.generateStandard} credit per photo`,
  },
];

export function HowItWorks() {
  return (
    <MarketingSection labelledBy="how-title">
      <SectionHeading
        id="how-title"
        eyebrow="How it works"
        title={
          <>
            Selfies in. <span className="italic">Portfolio</span> out.
          </>
        }
        lead="No studio, no photographer, no week-long wait. Three steps from your camera roll to photos you'd actually post."
      />
      <div className="relative mt-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-11 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block"
        />
        <ol className="relative grid gap-5 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body, meta }, i) => (
            <li key={title} className="relative flex flex-col rounded-2xl border bg-card p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-display text-5xl leading-none text-brand-gradient">{i + 1}</span>
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-foreground">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold">{title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{body}</p>
              <p className="mt-5 font-mono text-xs tracking-wide text-muted-foreground uppercase">{meta}</p>
            </li>
          ))}
        </ol>
      </div>
    </MarketingSection>
  );
}
