"use client";

import Link from "next/link";
import useSWR from "swr";
import { ApertureIcon, PlusIcon, ScanFaceIcon, UsersRoundIcon } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { CropMarks } from "@/components/ui/darkroom";
import { Progress } from "@/components/ui/progress";
import { useJob } from "@/hooks/use-job";
import { useMe } from "@/hooks/use-me";
import { MODELS_KEY } from "@/hooks/use-models";
import { useT } from "@/i18n/react";
import { fetcher } from "@/lib/api-client";
import type { ModelView } from "@/server/models/types";
import { cn } from "@/lib/utils";
import { ModeBadge, ModelStatusBadge } from "./model-status-badge";
import { TYPICAL_TRAINING_MINUTES, trainingEta } from "./training-eta";
import { useNow } from "./use-now";

export interface ModelsListProps {
  initialModels: ModelView[];
}

/** The user's models (cards with status + next step) and models shared with them. */
export function ModelsList({ initialModels }: ModelsListProps) {
  const t = useT();
  const { data, mutate } = useSWR<{ models: ModelView[] }>(MODELS_KEY, fetcher, {
    fallbackData: { models: initialModels },
    revalidateOnMount: true,
  });
  const models = data?.models ?? initialModels;
  const own = models.filter((m) => !m.shared);
  const shared = models.filter((m) => m.shared);

  if (own.length === 0 && shared.length === 0) {
    return (
      <EmptyState
        icon={<ScanFaceIcon />}
        title={t("empty.firstModel")}
        description={t("empty.firstModelBody")}
        action={
          <Button asChild variant="brand" size="lg">
            <Link href="/app/models/new">
              <PlusIcon />
              {t("empty.createModel")}
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-12">
      <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 lg:grid-cols-3 xl:grid-cols-4" aria-label="Your models">
        {own.map((m, i) => (
          <ModelCard key={m.id} model={m} roll={i + 1} onTrainingDone={() => void mutate()} />
        ))}
        <li>
          {/* An empty frame waiting for a new roll. */}
          <Link
            href="/app/models/new"
            className="group relative flex h-full min-h-56 flex-col justify-between gap-3 rounded-xs border border-dashed border-foreground/30 p-4 transition-colors hover:border-foreground/60 hover:bg-foreground/[0.03]"
          >
            <CropMarks inset="0.5rem" size="0.75rem" weight="1px" className="text-foreground/30" />
            <span className="mono-caps text-muted-foreground">Roll {String(own.length + 1).padStart(2, "0")} · unexposed</span>
            <span className="flex flex-col gap-1">
              <span className="flex items-center gap-2 font-display text-2xl leading-none">
                <PlusIcon aria-hidden="true" className="size-5 text-safelight-ink" />
                New model
              </span>
              <span className="text-sm text-muted-foreground">Another look, or another person who consents.</span>
            </span>
          </Link>
        </li>
      </ul>

      {shared.length > 0 && (
        <section aria-labelledby="shared-models" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 border-b border-border pb-3">
            <h2 id="shared-models" className="font-display text-[1.75rem] leading-none">
              Shared with you
            </h2>
            <p className="text-sm text-muted-foreground">Friends who accepted your invite. Use them in Together photos.</p>
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 lg:grid-cols-3 xl:grid-cols-4">
            {shared.map((m, i) => (
              <ModelCard key={m.id} model={m} roll={i + 1} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function nextStep(model: ModelView): { href: string; label: string; icon: typeof ApertureIcon } | null {
  if (model.shared) return model.status === "ready" ? { href: "/app/together", label: "Together photos", icon: UsersRoundIcon } : null;
  switch (model.status) {
    case "awaiting_consent":
    case "collecting":
    case "failed":
      return { href: `/app/models/new?id=${model.id}`, label: "Continue setup", icon: ScanFaceIcon };
    case "ready":
      return { href: `/app/create?model=${model.id}`, label: "Create photos", icon: ApertureIcon };
    default:
      return null;
  }
}

/**
 * A model as a print on the table: the cover in a thin paper border, the roll number and photo count in
 * mono, the name in the serif, and its next step underneath.
 */
function ModelCard({ model, roll, onTrainingDone }: { model: ModelView; roll: number; onTrainingDone?: () => void }) {
  const next = nextStep(model);
  const initial = model.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <li className="group relative flex flex-col gap-3">
      <div className="relative rounded-[1px] border border-foreground/12 bg-card p-1.5 pb-2 shadow-[0_14px_24px_-22px_rgb(0_0_0/0.55)] transition-transform duration-300 group-hover:-translate-y-0.5">
        <div className="relative aspect-[4/5] overflow-hidden bg-darkroom">
          {model.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL
            <img src={model.coverUrl} alt="" className="size-full object-cover" />
          ) : (
            <div aria-hidden="true" className="relative flex size-full items-center justify-center font-display text-7xl text-darkroom-foreground/85">
              <CropMarks inset="0.75rem" size="0.875rem" weight="1px" className="text-darkroom-foreground/40" />
              {initial}
            </div>
          )}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            <ModelStatusBadge status={model.status} className="bg-background/90" />
            {(model.status === "ready" || model.status === "training") && <ModeBadge mode={model.mode} className={model.mode === "instant" ? "bg-background/90" : undefined} />}
          </div>
        </div>
        <p aria-hidden="true" className="mt-1.5 flex justify-between font-mono text-[0.5625rem] tracking-[0.16em] text-muted-foreground uppercase">
          <span>Roll {String(roll).padStart(2, "0")}</span>
          <span>OpenShoot 400</span>
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-2.5">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="truncate font-display text-2xl leading-none">
            {/* Stretched link over the whole print; the focus ring follows its edge. */}
            <Link
              href={`/app/models/${model.id}`}
              className="after:absolute after:inset-0 after:rounded-xs focus-visible:underline focus-visible:outline-hidden focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
            >
              {model.name}
            </Link>
          </h3>
          <p className="font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground uppercase">
            {model.shared
              ? `Shared by ${model.ownerName || "a friend"}`
              : `${model.acceptedPhotoCount} ${model.acceptedPhotoCount === 1 ? "photo" : "photos"}`}
          </p>
        </div>
        {model.status === "training" && model.trainingJobId && (
          <TrainingBar jobId={model.trainingJobId} onDone={onTrainingDone} />
        )}
        {next && (
          <Button
            asChild
            size="sm"
            variant={model.status === "ready" ? "brand" : "outline"}
            className={cn("relative z-10 mt-auto w-full sm:w-fit")}
          >
            <Link href={next.href}>
              <next.icon />
              {next.label}
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

function TrainingBar({ jobId, onDone }: { jobId: string; onDone?: () => void }) {
  const { mutate: refreshMe } = useMe();
  const { job } = useJob(jobId, {
    onTerminal: () => {
      void refreshMe(); // a failed training is refunded
      onDone?.();
    },
  });
  const value = job ? Math.max(5, job.progress) : 5;
  const inFlight = !job || job.status === "queued" || job.status === "running";
  const now = useNow(30_000, inFlight);
  const eta = job && inFlight && now !== null ? trainingEta(job, now) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <Progress value={value} aria-label="Training progress" />
      <p className="text-xs text-muted-foreground">
        <span className="font-mono tracking-[0.12em] text-safelight-ink uppercase">Developing</span> ·{" "}
        {eta ? `${eta.label.charAt(0).toLowerCase()}${eta.label.slice(1)}` : `about ${TYPICAL_TRAINING_MINUTES} minutes`}. We&apos;ll
        email you.
      </p>
    </div>
  );
}
