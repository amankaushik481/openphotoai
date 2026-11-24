"use client";

import * as React from "react";
import { ShirtIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CostHint } from "@/components/app/cost-hint";
import { CategoryPicker } from "@/components/try-on/category-picker";
import { GarmentStep } from "@/components/try-on/garment-step";
import { PersonStep } from "@/components/try-on/person-step";
import { StepSection } from "@/components/try-on/step-section";
import { TryOnResult } from "@/components/try-on/try-on-result";
import type { GarmentUpload, TryOnCategory } from "@/components/try-on/types";
import { useJob } from "@/hooks/use-job";
import { useMe } from "@/hooks/use-me";
import { scrollBehavior } from "@/lib/a11y";
import { ApiClientError, api } from "@/lib/api-client";
import type { JobDTO, JobInput, MediaDTO } from "@/types/domain";

export interface TryOnStudioProps {
  /** Photo preselected via `?mediaId=` (already authorized server-side). */
  initialPerson: MediaDTO | null;
  /** `?mediaId=` was given but isn't one of the user's photos. */
  personNotFound?: boolean;
}

/** Keep `?mediaId=` in sync so a refresh or shared link reopens the same photo. */
function rememberPerson(mediaId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("mediaId", mediaId);
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function TryOnStudio({ initialPerson, personNotFound = false }: TryOnStudioProps) {
  const { mutate: refreshMe } = useMe();
  const [person, setPerson] = React.useState<MediaDTO | null>(initialPerson);
  const [garment, setGarment] = React.useState<GarmentUpload | null>(null);
  const [category, setCategory] = React.useState<TryOnCategory>("auto");
  const [created, setCreated] = React.useState<JobDTO | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const garmentRef = React.useRef<HTMLElement>(null);

  const { job, cancel } = useJob(created?.id, {
    fallbackJob: created ?? undefined,
    // Refunds (failures, likeness guarantee) change the balance.
    onTerminal: () => void refreshMe(),
  });

  const input: JobInput = {
    type: "try_on",
    personMediaId: person?.id ?? "",
    garmentUploadId: garment?.id ?? "",
    category,
  };
  const ready = Boolean(person && garment);

  async function run() {
    if (!person || !garment || submitting) return;
    setSubmitting(true);
    try {
      const res = await api<{ job: JobDTO }>("/api/jobs", {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": newIdempotencyKey() },
      });
      setCreated(res.job);
      void refreshMe();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Couldn't start the try-on. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function tryAnother() {
    setCreated(null);
    setGarment(null);
    // Wait for the steps to re-render, then move focus to the garment step.
    requestAnimationFrame(() => {
      garmentRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
      garmentRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    });
  }

  async function cancelJob() {
    try {
      await cancel();
      void refreshMe();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Couldn't cancel the try-on.");
    }
  }

  if (created && person && garment) {
    return (
      <TryOnResult
        job={job}
        person={person}
        garment={garment}
        onTryAnother={tryAnother}
        onRetry={() => void run()}
        onCancel={() => void cancelJob()}
        retrying={submitting}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {personNotFound && !person && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>We couldn&apos;t find that photo. Pick one of your photos below.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <PersonStep
          person={person}
          disabled={submitting}
          onChange={(next) => {
            if (next.kind !== "image") {
              toast.error("Pick a photo, not a video.");
              return;
            }
            setPerson(next);
            rememberPerson(next.id);
          }}
        />
        <GarmentStep
          ref={garmentRef}
          garment={garment}
          disabled={submitting}
          onUploaded={setGarment}
          onClear={() => setGarment(null)}
        />
      </div>

      <StepSection step={3} title="Try it on" description="Tell us what kind of garment it is, then start.">
        <CategoryPicker value={category} onValueChange={setCategory} disabled={submitting} />
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <CostHint input={input} />
          <Button
            type="button"
            variant="brand"
            size="lg"
            className="w-full sm:w-auto"
            disabled={!ready || submitting}
            aria-busy={submitting || undefined}
            onClick={() => void run()}
          >
            <ShirtIcon />
            {submitting ? "Starting…" : "Try it on"}
          </Button>
        </div>
        {!ready && (
          <p className="text-sm text-muted-foreground">
            {!person && !garment
              ? "Pick your photo and upload a garment to continue."
              : !person
                ? "Pick your photo to continue."
                : "Upload a garment to continue."}
          </p>
        )}
      </StepSection>
    </div>
  );
}
