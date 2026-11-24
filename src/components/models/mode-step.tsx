"use client";

import * as React from "react";
import Link from "next/link";
import { CircleAlertIcon, GaugeIcon, LoaderCircleIcon, SparklesIcon, TimerIcon, ZapIcon } from "lucide-react";

import { CostHint } from "@/components/app/cost-hint";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CREDIT_COSTS, INSTANT_MODE_MULTIPLIER } from "@/config/credits";
import { useMe } from "@/hooks/use-me";
import { ApiClientError } from "@/lib/api-client";
import type { IdentityMode, ModelView, ReadinessByMode } from "@/server/models/types";
import type { JobDTO } from "@/types/domain";
import { cn } from "@/lib/utils";
import { modelsApi } from "./use-model";

const OPTIONS: Record<
  IdentityMode,
  { title: string; tagline: string; icon: typeof ZapIcon; points: { icon: typeof ZapIcon; text: string }[] }
> = {
  instant: {
    title: "Instant",
    tagline: "Free · ready in seconds",
    icon: ZapIcon,
    points: [
      { icon: TimerIcon, text: "Ready right away, no training" },
      { icon: GaugeIcon, text: "Good likeness from your best photos" },
      { icon: SparklesIcon, text: `Photos cost ${INSTANT_MODE_MULTIPLIER}× credits (drafts stay free)` },
    ],
  },
  trained: {
    title: "Trained",
    tagline: `${CREDIT_COSTS.train} credits · about 20 minutes`,
    icon: SparklesIcon,
    points: [
      { icon: SparklesIcon, text: "Best likeness: a private AI model trained on your photos" },
      { icon: TimerIcon, text: "We'll email you when it's ready" },
      { icon: GaugeIcon, text: "Standard photo prices, refund if training fails" },
    ],
  },
};

export interface ModeStepProps {
  modelId: string;
  readinessByMode: ReadinessByMode;
  onStarted: (result: { model: ModelView; job: JobDTO | null }) => void;
}

/** Choose Instant (free) or Trained (40 credits) and start the model. */
export function ModeStep({ modelId, readinessByMode, onStarted }: ModeStepProps) {
  const { user, mutate: refreshMe } = useMe();
  const [mode, setMode] = React.useState<IdentityMode>(readinessByMode.trained.canTrain ? "trained" : "instant");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<ApiClientError | Error | null>(null);
  const groupId = React.useId();

  const readiness = readinessByMode[mode];
  const cost = mode === "trained" ? CREDIT_COSTS.train : 0;
  const short = user !== undefined && cost > user.credits;

  const start = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await modelsApi.train(modelId, mode);
      void refreshMe();
      onStarted(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Something went wrong."));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Choose how to create your model</legend>
        {(Object.keys(OPTIONS) as IdentityMode[]).map((key) => {
          const option = OPTIONS[key];
          const r = readinessByMode[key];
          const Icon = option.icon;
          const id = `${groupId}-${key}`;
          return (
            <label
              key={key}
              htmlFor={id}
              className={cn(
                "relative flex cursor-pointer flex-col gap-4 rounded-xl border-2 bg-card p-4 transition-colors sm:p-5",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                mode === key ? "border-primary bg-brand-soft/40" : "border-border hover:border-primary/40",
              )}
            >
              <input
                id={id}
                type="radio"
                name={groupId}
                value={key}
                checked={mode === key}
                onChange={() => setMode(key)}
                className="sr-only"
              />
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-10 items-center justify-center rounded-lg",
                      key === "trained" ? "bg-brand-gradient text-white" : "bg-brand-soft text-brand-soft-foreground",
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-lg font-semibold">{option.title}</span>
                    <span className="text-sm text-muted-foreground">{option.tagline}</span>
                  </span>
                </span>
                {key === "trained" && <Badge variant="soft">Best likeness</Badge>}
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {option.points.map(({ icon: PointIcon, text }) => (
                  <li key={text} className="flex gap-2">
                    <PointIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                    {text}
                  </li>
                ))}
              </ul>
              <p className={cn("text-xs", r.canTrain ? "text-success" : "text-muted-foreground")}>
                {r.canTrain
                  ? `Ready: ${r.accepted} good photos`
                  : `Needs ${r.minRequired}+ good photos (you have ${r.accepted})`}
              </p>
            </label>
          );
        })}
      </fieldset>

      {!readiness.canTrain && readiness.blockers.length > 0 && (
        <Alert variant="warning">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Not quite ready for {OPTIONS[mode].title} mode</AlertTitle>
          <AlertDescription>
            {readiness.blockers.map((b) => (
              <p key={b}>{b}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Couldn&apos;t start your model</AlertTitle>
          <AlertDescription>
            <p>{error.message}</p>
            {error instanceof ApiClientError && error.code === "insufficient_credits" && (
              <Button asChild size="sm" variant="brand" className="mt-1">
                <Link href="/app/billing">Buy credits</Link>
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CostHint credits={cost} />
        <Button
          type="button"
          variant="brand"
          size="lg"
          disabled={pending || !readiness.canTrain || short}
          aria-busy={pending}
          onClick={() => void start()}
        >
          {pending ? <LoaderCircleIcon className="animate-spin" /> : <SparklesIcon />}
          {mode === "instant" ? "Create Instant model" : `Train my model · ${CREDIT_COSTS.train} credits`}
        </Button>
      </div>
    </div>
  );
}
