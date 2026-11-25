"use client";

import { Badge } from "@/components/ui/badge";
import type { ModelStatus } from "@/types/domain";
import { cn } from "@/lib/utils";

/** Darkroom vocabulary for a model's state (mono caps in the badge; the words stay plain for screen readers). */
export const MODEL_STATUS_LABEL: Record<ModelStatus, string> = {
  awaiting_consent: "Needs selfie",
  collecting: "Loading photos",
  training: "Developing",
  ready: "Ready",
  failed: "Failed · refunded",
  deleting: "Deleting",
};

const VARIANT: Record<ModelStatus, "outline" | "secondary" | "soft" | "success" | "destructive"> = {
  awaiting_consent: "outline",
  collecting: "outline",
  training: "soft",
  ready: "success",
  failed: "destructive",
  deleting: "outline",
};

/** The safelight lamp: lit (and slowly breathing) while a model develops. */
function Lamp({ status }: { status: ModelStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-full bg-current",
        status === "training" && "motion-safe:animate-pulse",
        (status === "awaiting_consent" || status === "collecting" || status === "deleting") && "opacity-50",
      )}
    />
  );
}

export function ModelStatusBadge({ status, className }: { status: ModelStatus; className?: string }) {
  return (
    <Badge variant={VARIANT[status]} className={cn("gap-1.5", className)}>
      <Lamp status={status} />
      {MODEL_STATUS_LABEL[status]}
    </Badge>
  );
}

export function ModeBadge({ mode, className }: { mode: "instant" | "trained"; className?: string }) {
  return (
    <Badge variant={mode === "instant" ? "outline" : "default"} className={className}>
      {mode === "instant" ? "Instant" : "Trained"}
    </Badge>
  );
}
