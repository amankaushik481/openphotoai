"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, ChevronUpIcon, LayersIcon, LoaderCircleIcon, SparklesIcon, WandSparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AspectRatioPicker } from "@/components/app/aspect-ratio-picker";
import { CostHint } from "@/components/app/cost-hint";
import { ModelPicker } from "@/components/app/model-picker";
import { packGradient, packTextScrim } from "@/components/app/pack-card";
import { BrandKitSelect } from "@/components/teams/brand-kit-select";
import { ApiErrorAlert } from "@/components/create/api-error-alert";
import {
  BatchQualityControl,
  InstantModeBadge,
  StickyActionBar,
  StickyActionBarSpacer,
} from "@/components/create/controls";
import { GenerationResult } from "@/components/create/generation-result";
import {
  PACK_CATEGORY_LABELS,
  batchCost,
  batchPresets,
  clampBatchSize,
  costBreakdown,
  describeApiError,
  maxBatchFor,
  newIdempotencyKey,
  plural,
  resolveIdentityMode,
  type BatchQuality,
  type FriendlyError,
  type IdentityMode,
  type PackDetail,
} from "@/components/create/logic";
import { useDraftAllowance } from "@/components/create/use-draft-allowance";
import { useGenerationSession } from "@/components/create/use-generation-session";
import { useModelModes } from "@/components/create/use-model-modes";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api-client";
import type { AspectRatio, BatchDTO, IdentityModelDTO, JobDTO, PlanId } from "@/types/domain";
import { cn } from "@/lib/utils";

export interface PackStudioProps {
  pack: PackDetail;
  /** Optional fallback: identity mode per model id (the models list's `mode` takes precedence). */
  modelModes?: Record<string, IdentityMode>;
  /** Server-rendered allowance, used until /api/me (`draftsRemaining`) loads. */
  drafts: { limit: number; remaining: number };
  /** Server-side plan, used until /api/me loads. */
  plan: PlanId;
}

interface CreateBatchResponse {
  batch: BatchDTO;
  jobs: JobDTO[];
  requested: number;
  stoppedReason: "insufficient_credits" | "error" | null;
}

const SHOTS_PREVIEW = 12;
const DEFAULT_COUNT = 10;

/** `/app/packs/[slug]`: pack hero, shot list and the batch form ("Generate N photos" / free draft). */
export function PackStudio({ pack, modelModes: fallbackModes, drafts, plan: initialPlan }: PackStudioProps) {
  const router = useRouter();
  const formId = React.useId();
  const { user, mutate: refreshMe } = useMe();
  const plan = user?.plan ?? initialPlan;
  const maxBatch = maxBatchFor(plan);
  const nextPath = `/app/packs/${pack.slug}`;

  const [modelId, setModelId] = React.useState<string | null>(null);
  const [model, setModel] = React.useState<IdentityModelDTO | undefined>();
  const [countInput, setCountInput] = React.useState(Math.min(DEFAULT_COUNT, maxBatch));
  const [quality, setQuality] = React.useState<BatchQuality>("standard");
  const [overrideRatio, setOverrideRatio] = React.useState(false);
  const [aspectRatio, setAspectRatio] = React.useState<AspectRatio>(pack.defaultAspectRatio);
  const [brandKitId, setBrandKitId] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState<"batch" | "draft" | null>(null);
  const [error, setError] = React.useState<FriendlyError | null>(null);
  const { draftsLeft, spend: spendDraft, exhaust: exhaustDrafts } = useDraftAllowance(drafts.remaining);
  const { modes: modelModes } = useModelModes(fallbackModes);
  const session = useGenerationSession({ nextPath, limit: 6 });

  const count = clampBatchSize(countInput, plan);
  const identityMode = resolveIdentityMode(model ?? (modelId ? { id: modelId } : null), modelModes);
  const cost = batchCost({ count, quality, mode: identityMode });

  async function generateBatch(e?: React.FormEvent) {
    e?.preventDefault();
    if (submitting) return;
    if (!modelId) {
      setError({ code: "validation_error", title: "Almost there", message: "Choose an identity model first." });
      return;
    }
    setSubmitting("batch");
    setError(null);
    try {
      const res = await api<CreateBatchResponse>("/api/batches", {
        method: "POST",
        // A network-level retry of this click can't start a second (charged) batch.
        headers: { "Idempotency-Key": newIdempotencyKey() },
        body: {
          modelId,
          packId: pack.slug,
          count,
          quality,
          ...(overrideRatio ? { aspectRatio } : {}),
          ...(brandKitId ? { brandKitId } : {}),
        },
      });
      void refreshMe();
      const short = res.requested > res.batch.total ? `?requested=${res.requested}` : "";
      router.push(`/app/batches/${res.batch.id}${short}`);
      // Keep the button disabled while navigating so a second click can't start another batch.
    } catch (err) {
      setError(describeApiError(err, { nextPath }));
      setSubmitting(null);
    }
  }

  async function tryDraft() {
    if (submitting) return;
    if (!modelId) {
      setError({ code: "validation_error", title: "Almost there", message: "Choose an identity model first." });
      return;
    }
    setSubmitting("draft");
    setError(null);
    try {
      await session.submit(
        {
          type: "generate",
          modelId,
          packId: pack.slug,
          quality: "draft",
          numImages: 1,
          aspectRatio: overrideRatio ? aspectRatio : pack.defaultAspectRatio,
          ...(brandKitId ? { brandKitId } : {}),
        },
        `Free draft · ${pack.name}`,
      );
      spendDraft();
    } catch (err) {
      const friendly = describeApiError(err, { draft: true, nextPath });
      if (friendly.code === "rate_limited") exhaustDrafts();
      setError(friendly);
    } finally {
      setSubmitting(null);
    }
  }

  const generateLabel = `Generate ${count} ${plural(count, "photo")}`;
  const generateButton = (className?: string) => (
    <Button
      type="submit"
      form={formId}
      variant="brand"
      size="lg"
      disabled={submitting !== null || !modelId}
      className={className}
    >
      {submitting === "batch" ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : <SparklesIcon aria-hidden="true" />}
      {submitting === "batch" ? "Starting batch…" : generateLabel}
    </Button>
  );

  return (
    <div className="flex flex-col gap-8">
      <PackHero pack={pack} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <form
          id={formId}
          onSubmit={generateBatch}
          noValidate
          aria-label={`Generate photos from ${pack.name}`}
          className="flex flex-col gap-5 rounded-xl border bg-card p-4 shadow-xs sm:p-5 lg:order-2 lg:self-start"
        >
          <div className="flex flex-col gap-2">
            <ModelPicker
              value={modelId}
              includeShared={false}
              onValueChange={(id, m) => {
                setModelId(id);
                setModel(m);
              }}
            />
            <InstantModeBadge mode={identityMode} className="self-start" />
          </div>

          <BatchSizeField count={count} max={maxBatch} plan={plan} onChange={setCountInput} />

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={`${formId}-ratio`} className="leading-snug">
                Same aspect ratio for every shot
              </Label>
              <Switch id={`${formId}-ratio`} checked={overrideRatio} onCheckedChange={setOverrideRatio} />
            </div>
            {overrideRatio ? (
              <AspectRatioPicker value={aspectRatio} onValueChange={setAspectRatio} hideLabel />
            ) : (
              <p className="text-xs text-muted-foreground">
                Each shot uses the framing it was designed for (mostly {pack.defaultAspectRatio}).
              </p>
            )}
          </div>

          <BatchQualityControl value={quality} onValueChange={setQuality} mode={identityMode} />
          <BrandKitSelect value={brandKitId} onChange={setBrandKitId} />

          <div className="flex flex-col gap-1 rounded-lg bg-muted/60 p-3">
            <p className="text-sm font-medium tabular-nums">{costBreakdown({ count, quality, mode: identityMode })}</p>
            <CostHint credits={cost} />
            <p className="text-xs text-muted-foreground">Photos that fail or get blocked are refunded automatically.</p>
          </div>

          <ApiErrorAlert error={error} onDismiss={() => setError(null)} />

          <div className="hidden flex-col gap-2 md:flex">{generateButton("w-full")}</div>
          <Button
            type="button"
            variant="outline"
            onClick={tryDraft}
            disabled={submitting !== null || !modelId || draftsLeft <= 0}
            className="h-auto w-full flex-col gap-0 py-2"
          >
            <span className="flex items-center gap-2">
              {submitting === "draft" ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              ) : (
                <WandSparklesIcon aria-hidden="true" />
              )}
              Try 1 free draft first
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {draftsLeft > 0 ? `${draftsLeft} free ${plural(draftsLeft, "draft")} left today` : "No free drafts left today"}
            </span>
          </Button>
        </form>

        <div className="flex min-w-0 flex-col gap-8 lg:order-1">
          {session.entries.length > 0 && (
            <section aria-labelledby={`${formId}-drafts`} className="flex flex-col gap-3">
              <h2 id={`${formId}-drafts`} className="text-lg font-semibold">
                Your drafts
              </h2>
              <ol className="flex flex-col gap-4">
                {session.entries.map((entry) => (
                  <li key={entry.job.id}>
                    <GenerationResult
                      job={entry.job}
                      title={entry.title}
                      modelModes={modelModes}
                      rerenders={session.rerenders}
                      onFullQuality={session.fullQuality}
                      onTerminal={session.onTerminal}
                      onDismiss={session.dismiss}
                    />
                  </li>
                ))}
              </ol>
              <p role="status" aria-live="polite" className="sr-only">
                {session.announcement}
              </p>
            </section>
          )}
          <ShotList pack={pack} />
        </div>
      </div>

      <StickyActionBar>
        <div className="flex min-w-0 flex-1 flex-col text-xs leading-tight">
          <span className="font-semibold tabular-nums">
            {cost} {plural(cost, "credit")}
          </span>
          <span className="truncate text-muted-foreground">
            {count} {plural(count, "photo")} · {quality}
          </span>
        </div>
        {generateButton("h-11 flex-1")}
      </StickyActionBar>
      <StickyActionBarSpacer />
    </div>
  );
}

function PackHero({ pack }: { pack: PackDetail }) {
  return (
    <section
      aria-labelledby="pack-title"
      className="grain relative overflow-hidden rounded-2xl text-white shadow-sm"
      style={{ backgroundImage: packGradient(pack.colors) }}
    >
      {/* Scrim sized to the pack's lightest color keeps the white text ≥ 5:1 (light packs get more). */}
      <div
        className="flex flex-col gap-4 bg-gradient-to-t from-black/45 via-black/15 to-transparent p-5 sm:flex-row sm:items-end sm:gap-6 sm:p-8"
        style={{ backgroundColor: `rgb(0 0 0 / ${packTextScrim(pack.colors)})` }}
      >
        <span aria-hidden="true" className="text-6xl drop-shadow-sm sm:text-7xl">
          {pack.emoji ?? "📸"}
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge className="bg-white/90 text-neutral-900">{PACK_CATEGORY_LABELS[pack.category]}</Badge>
            <Badge className="bg-black/35 text-white">
              <LayersIcon aria-hidden="true" />
              {pack.promptCount} styles
            </Badge>
            {pack.isNew && <Badge className="bg-white/90 text-neutral-900">New</Badge>}
          </div>
          <h1 id="pack-title" className="font-display text-3xl leading-tight tracking-tight sm:text-4xl">
            {pack.name}
          </h1>
          <p className="max-w-2xl text-sm text-white/90 sm:text-base">{pack.tagline}</p>
        </div>
      </div>
    </section>
  );
}

function ShotList({ pack }: { pack: PackDetail }) {
  const [expanded, setExpanded] = React.useState(false);
  const listId = React.useId();
  const shots = expanded ? pack.prompts : pack.prompts.slice(0, SHOTS_PREVIEW);
  const more = pack.prompts.length - SHOTS_PREVIEW;

  return (
    <section aria-labelledby={`${listId}-title`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={`${listId}-title`} className="text-lg font-semibold">
          About this pack
        </h2>
        <p className="text-sm text-muted-foreground">{pack.description}</p>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          {pack.prompts.length} {plural(pack.prompts.length, "shot")} — a batch cycles through them for variety
        </h3>
        <ol id={listId} className="grid gap-2 sm:grid-cols-2">
          {shots.map((shot, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-soft-foreground tabular-nums"
              >
                {i + 1}
              </span>
              <span className="min-w-0 truncate">{shot.title}</span>
            </li>
          ))}
        </ol>
        {more > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
            {expanded ? "Show fewer" : `Show all ${pack.prompts.length} shots`}
          </Button>
        )}
      </div>
    </section>
  );
}

function BatchSizeField({
  count,
  max,
  plan,
  onChange,
}: {
  count: number;
  max: number;
  plan: PlanId;
  onChange: (n: number) => void;
}) {
  const labelId = React.useId();
  const presets = batchPresets(plan);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <Label id={labelId}>How many photos</Label>
        <span className="text-2xl font-semibold tabular-nums" aria-hidden="true">
          {count}
        </span>
      </div>
      {/* Native range input: fully keyboard/screen-reader accessible and labelled (Radix thumbs aren't). */}
      <input
        type="range"
        min={1}
        max={max}
        step={1}
        value={count}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-labelledby={labelId}
        aria-valuetext={`${count} ${plural(count, "photo")}`}
        className="h-6 w-full cursor-pointer accent-primary"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((n) => (
          <Button
            key={n}
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={count === n}
            onClick={() => onChange(n)}
            className={cn("h-7 px-2.5 tabular-nums", count === n && "border-primary bg-brand-soft text-brand-soft-foreground")}
          >
            {n}
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">Up to {max} on your plan</span>
      </div>
    </div>
  );
}
