"use client";

import * as React from "react";
import { BadgeCheckIcon, CameraIcon, LockIcon, MoveHorizontalIcon, ShieldCheckIcon, UserRoundCheckIcon } from "lucide-react";

import type { ModelView } from "@/server/models/types";
import { CameraCapture } from "./camera-capture";
import { modelsApi } from "./use-model";

const HOW = [
  { icon: CameraIcon, label: "Selfie" },
  { icon: MoveHorizontalIcon, label: "2 small head moves" },
  { icon: BadgeCheckIcon, label: "Instant check" },
] as const;

const WHY = [
  {
    icon: UserRoundCheckIcon,
    title: "Only you can create a model of you",
    body: "Every photo you upload is compared with this selfie. Photos of anyone else are refused.",
  },
  {
    icon: BadgeCheckIcon,
    title: "Adults only",
    body: "We check that the person in the selfie is over 18. Models of minors are never allowed.",
  },
  {
    icon: LockIcon,
    title: "Private, and deletable any time",
    body: "The selfie is stored privately, never shown to anyone, and deleted together with your model.",
  },
] as const;

export interface ConsentStepProps {
  modelId: string;
  onVerified: (model: ModelView) => void;
}

/** Explains why we need a live consent selfie, then captures it with the camera (no file upload). */
export function ConsentStep({ modelId, onVerified }: ConsentStepProps) {
  const token = React.useRef<string | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-x-10">
      {/* Phones: intro → camera → why. Desktop: intro + why on the left, the camera on the right. */}
      <div className="flex flex-col gap-4 lg:col-start-1">
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <ShieldCheckIcon aria-hidden="true" className="size-5 text-primary" />
            Take a quick consent selfie
          </h2>
          <p className="text-sm text-muted-foreground sm:text-base">
            About 20 seconds, once per model. It confirms you are the person in your photos and that you agree to an AI
            model of yourself. It&apos;s how we keep your likeness yours: models are only made with the live consent of the
            person in them.
          </p>
        </div>
        <ol aria-label="How it works" className="grid grid-cols-3 gap-2 text-center text-xs sm:text-sm">
          {HOW.map(({ icon: Icon, label }, i) => (
            <li key={label} className="flex flex-col items-center gap-1.5 rounded-xl bg-muted/50 px-2 py-3">
              <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
                <Icon className="size-4" />
              </span>
              <span>
                <span className="sr-only">Step {i + 1}: </span>
                {label}
              </span>
            </li>
          ))}
        </ol>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">For a smooth check:</span>
          <span>good light</span>
          <span aria-hidden="true">·</span>
          <span>no sunglasses or mask</span>
          <span aria-hidden="true">·</span>
          <span>just you in the frame</span>
        </p>
      </div>

      <CameraCapture
        onCountdownStart={async () => {
          // The token comes with a random head-movement sequence (active liveness) the camera guides through.
          const challenge = await modelsApi.challenge(modelId);
          token.current = challenge.captureToken;
          return { steps: challenge.steps };
        }}
        onConfirm={async (photo, livenessFrames) => {
          const captureToken = token.current;
          token.current = null; // single use: a retake gets a fresh token (and new steps)
          if (!captureToken) throw new Error("Please retake the selfie.");
          const { model } = await modelsApi.consent(modelId, photo, captureToken, livenessFrames);
          onVerified(model);
        }}
        className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
      />

      <section aria-labelledby="consent-why" className="flex flex-col gap-4 lg:col-start-1">
        <h3 id="consent-why" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Why we ask
        </h3>
        <ul className="flex flex-col gap-4">
          {WHY.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
                <Icon className="size-5" />
              </span>
              <span className="flex flex-col">
                <span className="font-medium">{title}</span>
                <span className="text-sm text-muted-foreground">{body}</span>
              </span>
            </li>
          ))}
        </ul>
        <details className="group rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
          <summary className="cursor-pointer rounded-sm font-medium text-foreground select-none">
            Why can&apos;t I upload a photo instead?
          </summary>
          <p className="mt-2">
            Consent has to be given live by the person in the model, so the selfie must be taken now with your camera. After
            the photo, we&apos;ll ask you to turn or tilt your head slightly a couple of times: this short movement check
            shows it&apos;s really you, live, and not a printed photo or a screen. No camera on this device? Open this page on
            your phone: your progress is saved.
          </p>
        </details>
      </section>
    </div>
  );
}
