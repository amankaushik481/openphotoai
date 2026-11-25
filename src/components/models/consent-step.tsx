"use client";

import * as React from "react";

import type { ModelView } from "@/server/models/types";
import { CameraCapture } from "./camera-capture";
import { modelsApi } from "./use-model";

const HOW = ["Selfie", "2 small head moves", "Instant check"] as const;

const WHY = [
  {
    title: "Only you can create a model of you",
    body: "Every photo you upload is compared with this selfie. Photos of anyone else are refused.",
  },
  {
    title: "Adults only",
    body: "We check that the person in the selfie is over 18. Models of minors are never allowed.",
  },
  {
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-x-12">
      {/* Phones: intro → camera → why. Desktop: intro + why on the left, the camera on the right. */}
      <div className="flex flex-col gap-5 lg:col-start-1">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-[1.75rem] leading-none sm:text-3xl">Take a quick consent selfie</h2>
          <p className="text-sm text-muted-foreground sm:text-base">
            About 20 seconds, once per model. It confirms you&apos;re the person in your photos and that you agree to an AI
            model of yourself, so your likeness stays yours.
          </p>
        </div>
        {/* The sequence as a mono exposure readout: 01 → 02 → 03. */}
        <ol
          aria-label="How it works"
          className="grid grid-cols-3 divide-x divide-border border-y border-border font-mono text-[0.6875rem] tracking-[0.1em] uppercase"
        >
          {HOW.map((label, i) => (
            <li key={label} className="flex flex-col gap-1 px-2 py-3 first:pl-0 sm:px-3">
              <span aria-hidden="true" className="text-safelight-ink">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="leading-snug">
                <span className="sr-only">Step {i + 1}: </span>
                {label}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">For a smooth check:</span> good light, no sunglasses or mask, just
          you in the frame.
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

      {/* Darkroom rules: a lab notice, numbered, on hairlines. */}
      <section aria-labelledby="consent-why" className="flex flex-col gap-3 lg:col-start-1">
        <h3 id="consent-why" className="mono-caps text-muted-foreground">
          Why we ask
        </h3>
        <ol className="flex flex-col">
          {WHY.map(({ title, body }, i) => (
            <li key={title} className="flex gap-4 border-t border-border py-3.5 last:border-b">
              <span aria-hidden="true" className="w-6 shrink-0 pt-0.5 font-mono text-[0.6875rem] text-safelight-ink">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{title}</span>
                <span className="text-sm text-muted-foreground">{body}</span>
              </span>
            </li>
          ))}
        </ol>
        <details className="group rounded-xs border border-dashed border-foreground/25 px-3 py-2.5 text-sm text-muted-foreground">
          <summary className="cursor-pointer rounded-xs font-medium text-foreground select-none">
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
