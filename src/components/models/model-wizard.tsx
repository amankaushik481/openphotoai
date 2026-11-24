"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CircleAlertIcon, LayersIcon, LoaderCircleIcon, PartyPopperIcon, SparklesIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError } from "@/lib/api-client";
import type { ModelDetailResponse, ModelView } from "@/server/models/types";
import type { JobDTO, ModelStatus, Subject } from "@/types/domain";
import { scrollBehavior } from "@/lib/a11y";
import { cn } from "@/lib/utils";
import { ConsentStep } from "./consent-step";
import { ModeStep } from "./mode-step";
import { PhotosStep } from "./photos-step";
import { TrainingProgress } from "./training-progress";
import { modelsApi, useModel, useRefreshModels } from "./use-model";

type Step = "details" | "consent" | "photos" | "mode" | "training" | "done";

const STEPS: { id: Exclude<Step, "training">; label: string }[] = [
  { id: "details", label: "Name" },
  { id: "consent", label: "Consent" },
  { id: "photos", label: "Photos" },
  { id: "mode", label: "Model type" },
  { id: "done", label: "Ready" },
];

const SUBJECTS: { value: Subject; label: string; hint: string }[] = [
  { value: "woman", label: "Woman", hint: "she / her" },
  { value: "man", label: "Man", hint: "he / him" },
  { value: "person", label: "Person", hint: "neutral" },
];

function stepForStatus(status: ModelStatus): Step {
  switch (status) {
    case "awaiting_consent":
      return "consent";
    case "training":
      return "training";
    case "ready":
      return "done";
    default:
      return "photos";
  }
}

export interface ModelWizardProps {
  /** Resume an existing model (`/app/models/new?id=…`). */
  initial?: ModelDetailResponse | null;
}

/** Create-a-model flow: name → live consent selfie → photos → Instant / Trained → progress → done. */
export function ModelWizard({ initial }: ModelWizardProps) {
  const refreshModels = useRefreshModels();
  const [modelId, setModelId] = React.useState<string | null>(initial?.model.id ?? null);
  const [currentStep, setStep] = React.useState<Step>(initial ? stepForStatus(initial.model.status) : "details");
  const [job, setJob] = React.useState<JobDTO | null>(null);
  const { detail, mutate } = useModel(modelId, initial ?? undefined);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const go = React.useCallback((next: Step) => {
    setStep(next);
    // Move focus to the new step's heading for keyboard + screen-reader users.
    requestAnimationFrame(() => headingRef.current?.focus());
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }, []);

  // Training can finish while the page is open (the model polls while training).
  const step: Step = currentStep === "training" && detail?.model.status === "ready" ? "done" : currentStep;

  const visible = step === "training" ? "mode" : step;
  const current = STEPS.findIndex((s) => s.id === visible);
  const model = detail?.model;
  const title =
    step === "details"
      ? "Create your model"
      : step === "done"
        ? "Your model is ready"
        : step === "training"
          ? "Almost there"
          : (model?.name ?? "Your model");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <nav aria-label="Progress">
          <ol className="flex items-center gap-1.5 sm:gap-2">
            {STEPS.map((s, i) => {
              const done = i < current || step === "done";
              const active = i === current && step !== "done";
              return (
                <li key={s.id} className="flex flex-1 flex-col gap-1.5" aria-current={active ? "step" : undefined}>
                  <span
                    className={cn(
                      "h-1.5 rounded-full transition-colors",
                      done ? "bg-primary" : active ? "bg-brand-gradient" : "bg-muted",
                    )}
                  />
                  <span className={cn("hidden text-xs sm:block", active ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {s.label}
                    <span className="sr-only">{done ? " (done)" : active ? " (current)" : ""}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-xs text-muted-foreground sm:hidden">
            Step {Math.min(current + 1, STEPS.length)} of {STEPS.length}: {STEPS[Math.max(0, current)]?.label}
          </p>
        </nav>
        <h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl leading-tight tracking-tight focus:outline-hidden sm:text-4xl">
          {title}
        </h1>
      </div>

      {step === "details" && (
        <DetailsStep
          onCreated={(created) => {
            setModelId(created.id);
            void refreshModels();
            // Keep the id in the URL so a refresh resumes this model (no server round trip / remount).
            window.history.replaceState(null, "", `/app/models/new?id=${created.id}`);
            go("consent");
          }}
        />
      )}

      {step !== "details" && (!detail || !modelId) && <WizardSkeleton />}

      {detail && modelId && step === "consent" && (
        <ConsentStep
          modelId={modelId}
          onVerified={(verified) => {
            void mutate((prev) => prev && { ...prev, model: verified });
            void refreshModels();
            go("photos");
          }}
        />
      )}

      {detail && modelId && step === "photos" && (
        <PhotosStep modelId={modelId} detail={detail} mutate={mutate} onContinue={() => go("mode")} />
      )}

      {detail && modelId && step === "mode" && (
        <div className="flex flex-col gap-4">
          <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => go("photos")}>
            <ArrowLeftIcon />
            Back to photos
          </Button>
          <ModeStep
            modelId={modelId}
            readinessByMode={detail.readinessByMode}
            onStarted={(result) => {
              void mutate((prev) => prev && { ...prev, model: result.model });
              void refreshModels();
              setJob(result.job);
              go(result.job ? "training" : "done");
            }}
          />
        </div>
      )}

      {detail && modelId && step === "training" && (job?.id ?? detail.model.trainingJobId) && (
        <TrainingProgress
          jobId={(job?.id ?? detail.model.trainingJobId)!}
          fallbackJob={job ?? undefined}
          onFinished={() => {
            void mutate();
            void refreshModels();
          }}
          onRetry={() => {
            setJob(null);
            void mutate();
            go("mode");
          }}
        />
      )}

      {detail && modelId && step === "done" && <DoneStep model={detail.model} />}
    </div>
  );
}

function DetailsStep({ onCreated }: { onCreated: (model: ModelView) => void }) {
  const [name, setName] = React.useState("");
  const [subject, setSubject] = React.useState<Subject>("person");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<ApiClientError | Error | null>(null);
  const nameId = React.useId();
  const groupId = React.useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      const { model } = await modelsApi.create({ name: name.trim(), subject });
      onCreated(model);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Something went wrong."));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex max-w-xl flex-col gap-6">
      <p className="text-muted-foreground">
        Your model learns what you look like from a live selfie and a few photos. Then you can create professional
        photos of yourself in any style. It&apos;s private, and you can delete it at any time.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor={nameId}>Model name</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Me, Work me, Alex"
          maxLength={60}
          autoComplete="off"
          required
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">Only you see this name.</p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Who is in the photos?</legend>
        <div className="grid grid-cols-3 gap-2">
          {SUBJECTS.map((s) => (
            <label
              key={s.value}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border-2 p-3 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                subject === s.value ? "border-primary bg-brand-soft/40" : "border-border hover:border-primary/40",
              )}
            >
              <input
                type="radio"
                name={groupId}
                value={s.value}
                checked={subject === s.value}
                onChange={() => setSubject(s.value)}
                className="sr-only"
              />
              <span className="font-medium">{s.label}</span>
              <span className="text-xs text-muted-foreground">{s.hint}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Used to describe you in prompts, nothing else.</p>
      </fieldset>

      {error && (
        <Alert
          role="alert"
          variant={error instanceof ApiClientError && error.code === "plan_limit" ? "warning" : "destructive"}
        >
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Couldn&apos;t create the model</AlertTitle>
          <AlertDescription>
            <p>{error.message}</p>
            {error instanceof ApiClientError && error.code === "plan_limit" && (
              <Button asChild size="sm" variant="outline" className="mt-1">
                <Link href="/app/billing">See plans</Link>
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Button type="submit" variant="brand" size="lg" className="sm:w-fit" disabled={pending || !name.trim()} aria-busy={pending}>
        {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
        Continue
        <ArrowRightIcon />
      </Button>
    </form>
  );
}

function DoneStep({ model }: { model: ModelView }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 text-center">
      <div className="relative">
        {model.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL
          <img src={model.coverUrl} alt="" className="size-32 rounded-full border-4 border-background object-cover shadow-lg" />
        ) : (
          <span className="flex size-32 items-center justify-center rounded-full bg-brand-gradient text-white shadow-lg">
            <PartyPopperIcon aria-hidden="true" className="size-12" />
          </span>
        )}
        <span className="absolute -right-1 -bottom-1 flex size-10 items-center justify-center rounded-full border-4 border-background bg-success text-success-foreground">
          <CheckIcon aria-hidden="true" className="size-5" />
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-lg font-semibold">{model.name} is ready</p>
        <p className="text-sm text-muted-foreground sm:text-base">
          {model.mode === "instant"
            ? "Your Instant model is ready. Start with free drafts and keep the shots you love."
            : "Training finished. Time for your first photo shoot!"}
        </p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button asChild variant="brand" size="lg">
          <Link href={`/app/create?model=${model.id}`}>
            <SparklesIcon />
            Create photos
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/app/packs">
            <LayersIcon />
            Browse photo packs
          </Link>
        </Button>
      </div>
      <Link href={`/app/models/${model.id}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        View model details
      </Link>
    </div>
  );
}

function WizardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-6 w-64" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
