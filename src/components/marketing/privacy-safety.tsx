import Link from "next/link";
import { ArrowRightIcon, BanIcon, LockIcon, ScanFaceIcon, TagIcon, Trash2Icon, UserCheckIcon } from "lucide-react";

import { MarketingSection } from "@/components/marketing/section-heading";
import { TRAINING } from "@/config/app";

const POINTS = [
  {
    icon: ScanFaceIcon,
    title: "Only you can train on your face",
    body: "Every model starts with a live camera selfie and a head-turn check. Every training photo must match that face, so nobody can build a model of you from your Instagram.",
  },
  {
    icon: LockIcon,
    title: "Private by default",
    body: "Your model is yours alone. We never use your photos, models or results to train general AI models, and we never sell them.",
  },
  {
    icon: UserCheckIcon,
    title: "Adults only",
    body: `Every training photo and every face in every result is age-checked. Anything that may show someone under ${TRAINING.minAge} is blocked.`,
  },
  {
    icon: BanIcon,
    title: "No sexual content, ever",
    body: "Prompts, uploads and results are checked before anything is stored. Blocked results are discarded and refunded. There's no setting that turns this off.",
  },
  {
    icon: TagIcon,
    title: "Labelled as AI",
    body: "Every image and video carries standard AI-content metadata that platforms can detect. Free-plan images also get a visible watermark.",
  },
  {
    icon: Trash2Icon,
    title: "Real deletion",
    body: "Deleting a model removes your selfies, face data and model weights, including the copy at the AI provider. Account deletion is confirmed by email.",
  },
] as const;

/** Landing section: privacy and safety as a feature, not fine print. Static server markup. */
export function PrivacySafety() {
  return (
    <MarketingSection labelledBy="safety-title">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.6fr)] lg:gap-16">
        <div className="flex flex-col items-start">
          <p className="font-mono text-xs font-medium tracking-[0.18em] text-brand-soft-foreground uppercase">
            Privacy &amp; safety
          </p>
          <h2 id="safety-title" className="mt-3 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
            Your face. <span className="italic">Your rules.</span>
          </h2>
          <p className="mt-4 text-base text-pretty text-muted-foreground sm:text-lg">
            An AI model of your face is personal. Consent, age and content checks are a core part of the app, on every
            plan and on every self-hosted server.
          </p>
          <div className="mt-6 flex flex-col gap-2 text-sm font-medium">
            <Link
              href="/legal/privacy"
              className="inline-flex items-center gap-1.5 underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
            >
              Read the privacy policy
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
            <Link
              href="/docs#safety"
              className="inline-flex items-center gap-1.5 underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
            >
              How the safety checks work
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
        <ul className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-foreground">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-pretty text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </MarketingSection>
  );
}
