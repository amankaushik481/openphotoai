"use client";

import Link from "next/link";
import useSWR from "swr";
import { ImagesIcon, PlusIcon, ScanFaceIcon, SparklesIcon } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useJob } from "@/hooks/use-job";
import { MODELS_KEY } from "@/hooks/use-models";
import { useT } from "@/i18n/react";
import { fetcher } from "@/lib/api-client";
import type { ModelView } from "@/server/models/types";
import { cn } from "@/lib/utils";
import { ModeBadge, ModelStatusBadge } from "./model-status-badge";

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
    <div className="flex flex-col gap-10">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Your models">
        {own.map((m) => (
          <ModelCard key={m.id} model={m} onTrainingDone={() => void mutate()} />
        ))}
        <li>
          <Link
            href="/app/models/new"
            className="grain flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:border-primary/50 hover:bg-accent/30"
          >
            <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
              <PlusIcon className="size-5" />
            </span>
            <span className="font-medium">New model</span>
            <span className="text-sm text-muted-foreground">Another look, or another person who consents.</span>
          </Link>
        </li>
      </ul>

      {shared.length > 0 && (
        <section aria-labelledby="shared-models" className="flex flex-col gap-4">
          <div>
            <h2 id="shared-models" className="text-lg font-semibold">
              Shared with you
            </h2>
            <p className="text-sm text-muted-foreground">Friends who accepted your invite. Use them in Together photos.</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shared.map((m) => (
              <ModelCard key={m.id} model={m} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function nextStep(model: ModelView): { href: string; label: string; icon: typeof SparklesIcon } | null {
  if (model.shared) return model.status === "ready" ? { href: "/app/together", label: "Together photos", icon: SparklesIcon } : null;
  switch (model.status) {
    case "awaiting_consent":
    case "collecting":
    case "failed":
      return { href: `/app/models/new?id=${model.id}`, label: "Continue setup", icon: ScanFaceIcon };
    case "ready":
      return { href: `/app/create?model=${model.id}`, label: "Create photos", icon: SparklesIcon };
    default:
      return null;
  }
}

function ModelCard({ model, onTrainingDone }: { model: ModelView; onTrainingDone?: () => void }) {
  const next = nextStep(model);
  const initial = model.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <li className="group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-colors hover:border-primary/40">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {model.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL
          <img src={model.coverUrl} alt="" className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
        ) : (
          <div aria-hidden="true" className="flex size-full items-center justify-center bg-brand-gradient font-display text-6xl text-white/90">
            {initial}
          </div>
        )}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
          <ModelStatusBadge status={model.status} className="bg-background/90 shadow-sm" />
          {(model.status === "ready" || model.status === "training") && <ModeBadge mode={model.mode} />}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <h3 className="truncate font-semibold">
            {/* Stretched link: the focus ring goes inside the card's edge (the card clips overflow). */}
            <Link
              href={`/app/models/${model.id}`}
              className="after:absolute after:inset-0 after:rounded-xl focus-visible:underline focus-visible:outline-hidden focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
            >
              {model.name}
            </Link>
          </h3>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ImagesIcon aria-hidden="true" className="size-3.5" />
            {model.shared
              ? `Shared by ${model.ownerName || "a friend"}`
              : `${model.acceptedPhotoCount} ${model.acceptedPhotoCount === 1 ? "photo" : "photos"}`}
          </p>
        </div>
        {model.status === "training" && model.trainingJobId && (
          <TrainingBar jobId={model.trainingJobId} onDone={onTrainingDone} />
        )}
        {next && (
          <Button asChild size="sm" variant={model.status === "ready" ? "brand" : "outline"} className={cn("relative z-10 mt-auto w-fit")}>
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
  const { job } = useJob(jobId, { onTerminal: () => onDone?.() });
  const value = job ? Math.max(5, job.progress) : 5;
  return (
    <div className="flex flex-col gap-1">
      <Progress value={value} aria-label="Training progress" indicatorClassName="bg-brand-gradient" />
      <p className="text-xs text-muted-foreground">Training… about 20 minutes. We&apos;ll email you.</p>
    </div>
  );
}
