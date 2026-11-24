"use client";

import * as React from "react";
import { BadgeCheckIcon, LockIcon, ShieldCheckIcon, UserRoundCheckIcon } from "lucide-react";

import type { ModelView } from "@/server/models/types";
import { CameraCapture } from "./camera-capture";
import { modelsApi } from "./use-model";

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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
      <section aria-labelledby="consent-why" className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 id="consent-why" className="flex items-center gap-2 text-xl font-semibold">
            <ShieldCheckIcon aria-hidden="true" className="size-5 text-primary" />
            Take a quick consent selfie
          </h2>
          <p className="text-sm text-muted-foreground sm:text-base">
            This short live selfie confirms that you are the person in your photos and that you agree to create an AI
            model of yourself.
          </p>
        </div>
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
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <strong className="font-medium text-foreground">Why can&apos;t I upload a photo instead?</strong> Consent has to be
          given live by the person in the model, so the selfie must be taken now with your camera. Face the camera in
          good light, without sunglasses or a mask, with no one else in the frame.
        </p>
      </section>

      <CameraCapture
        onCountdownStart={async () => {
          token.current = (await modelsApi.challenge(modelId)).captureToken;
        }}
        onConfirm={async (photo) => {
          const captureToken = token.current;
          token.current = null; // single use: a retake gets a fresh token
          if (!captureToken) throw new Error("Please retake the selfie.");
          const { model } = await modelsApi.consent(modelId, photo, captureToken);
          onVerified(model);
        }}
      />
    </div>
  );
}
