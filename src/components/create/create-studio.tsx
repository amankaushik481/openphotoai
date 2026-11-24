"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRightIcon, ImageIcon, LayersIcon, LoaderCircleIcon, SparklesIcon, TrashIcon, TypeIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AspectRatioPicker } from "@/components/app/aspect-ratio-picker";
import { CostHint } from "@/components/app/cost-hint";
import { EmptyState } from "@/components/app/empty-state";
import { ModelPicker } from "@/components/app/model-picker";
import { BrandKitSelect } from "@/components/teams/brand-kit-select";
import { ApiErrorAlert } from "@/components/create/api-error-alert";
import {
  CountPicker,
  InstantModeBadge,
  QualityControl,
  StickyActionBar,
  StickyActionBarSpacer,
} from "@/components/create/controls";
import { GenerationResult } from "@/components/create/generation-result";
import {
  buildGenerateRequest,
  describeApiError,
  generateCost,
  plural,
  resolveIdentityMode,
  type CreateMode,
  type FriendlyError,
  type IdentityMode,
} from "@/components/create/logic";
import { PackQuickPicker, PackShotSelect, PackSwatch } from "@/components/create/pack-quick-picker";
import { PromptField } from "@/components/create/prompt-field";
import { ReferencePicker, type ReferenceUpload } from "@/components/create/reference-picker";
import { useGenerationSession } from "@/components/create/use-generation-session";
import type { AspectRatio, IdentityModelDTO, Quality } from "@/types/domain";
import type { PackSummary } from "@/types/pack";

export interface CreateStudioProps {
  packs: PackSummary[];
  /** Identity mode per owned model (instant models cost 2×). */
  modelModes: Record<string, IdentityMode>;
  drafts: { limit: number; remaining: number };
  initial?: { mode?: CreateMode; packId?: string; modelId?: string; prompt?: string };
}

const MODES: { value: CreateMode; label: string; icon: typeof TypeIcon }[] = [
  { value: "prompt", label: "Prompt", icon: TypeIcon },
  { value: "pack", label: "Pack", icon: LayersIcon },
  { value: "reference", label: "Style reference", icon: ImageIcon },
];

const NEXT_PATH = "/app/create";

export function CreateStudio({ packs, modelModes, drafts, initial }: CreateStudioProps) {
  const formId = React.useId();
  const resultsRef = React.useRef<HTMLElement>(null);

  const [modelId, setModelId] = React.useState<string | null>(initial?.modelId ?? null);
  const [model, setModel] = React.useState<IdentityModelDTO | undefined>();
  const [mode, setMode] = React.useState<CreateMode>(initial?.mode ?? (initial?.packId ? "pack" : "prompt"));
  const [prompt, setPrompt] = React.useState(initial?.prompt ?? "");
  const [packId, setPackId] = React.useState<string | null>(
    initial?.packId && packs.some((p) => p.slug === initial.packId) ? initial.packId : null,
  );
  const [packPromptIndex, setPackPromptIndex] = React.useState<number | null>(null);
  const [reference, setReference] = React.useState<ReferenceUpload | null>(null);
  const [aspectRatio, setAspectRatio] = React.useState<AspectRatio>("4:5");
  const [numImages, setNumImages] = React.useState(4);
  const [draftsLeft, setDraftsLeft] = React.useState(drafts.remaining);
  const [quality, setQuality] = React.useState<Quality>(drafts.remaining > 0 ? "draft" : "standard");
  const [seed, setSeed] = React.useState("");
  const [brandKitId, setBrandKitId] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<FriendlyError | null>(null);

  const session = useGenerationSession({ nextPath: NEXT_PATH });
  const identityMode = resolveIdentityMode(model ?? (modelId ? { id: modelId } : null), modelModes);
  const cost = generateCost({ quality, numImages, mode: identityMode });
  const selectedPack = packs.find((p) => p.slug === packId);
  const draftBlocked = quality === "draft" && draftsLeft <= 0;

  const submitLabel = submitting
    ? "Starting…"
    : `Generate ${numImages} ${quality === "draft" ? plural(numImages, "draft") : plural(numImages, "photo")}`;

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (submitting) return;
    const built = buildGenerateRequest({
      mode,
      modelId,
      prompt,
      packId,
      packPromptIndex,
      referenceUploadId: reference?.id ?? null,
      aspectRatio,
      numImages,
      quality,
      seed,
      brandKitId: brandKitId ?? null,
    });
    if (!built.ok) {
      setError({ code: "validation_error", title: "Almost there", message: built.message });
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await session.submit(built.body, jobTitle({ mode, prompt, pack: selectedPack, quality }));
      if (quality === "draft") setDraftsLeft((n) => Math.max(0, n - 1));
      scrollToResults(resultsRef.current);
    } catch (err) {
      const friendly = describeApiError(err, { draft: quality === "draft", nextPath: NEXT_PATH });
      setError(friendly);
      if (friendly.code === "rate_limited" && quality === "draft") {
        setDraftsLeft(0);
        setQuality("standard");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const submitButton = (className?: string) => (
    <Button
      type="submit"
      form={formId}
      variant="brand"
      size="lg"
      disabled={submitting || !modelId || draftBlocked}
      className={className}
    >
      {submitting ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : <SparklesIcon aria-hidden="true" />}
      {submitLabel}
    </Button>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
      <form id={formId} onSubmit={onSubmit} noValidate aria-label="Create photos" className="flex flex-col gap-6">
        <section className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs">
          <ModelPicker
            value={modelId}
            includeShared={false}
            onValueChange={(id, m) => {
              setModelId(id);
              setModel(m);
            }}
          />
          <InstantModeBadge mode={identityMode} className="self-start" />
        </section>

        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as CreateMode);
            setError(null);
          }}
          className="gap-4 rounded-xl border bg-card p-4 shadow-xs"
        >
          <TabsList className="grid h-10 w-full grid-cols-3">
            {MODES.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5 px-1.5 text-xs sm:text-sm">
                <Icon aria-hidden="true" />
                <span className="truncate">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="prompt" className="flex flex-col gap-4">
            <PromptField
              value={prompt}
              onChange={setPrompt}
              modelId={modelId}
              required
              label="Describe your photo"
              onSubmitShortcut={() => void onSubmit()}
            />
          </TabsContent>

          <TabsContent value="pack" className="flex flex-col gap-4">
            <PackQuickPicker
              packs={packs}
              value={packId}
              onValueChange={(slug) => {
                setPackId(slug);
                setPackPromptIndex(null);
              }}
            />
            {selectedPack && (
              <>
                <PackShotSelect slug={selectedPack.slug} value={packPromptIndex} onValueChange={setPackPromptIndex} />
                <Link
                  href={`/app/packs/${selectedPack.slug}`}
                  className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm transition-colors outline-none hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <PackSwatch pack={selectedPack} className="size-8 text-base" />
                  <span className="min-w-0 flex-1">
                    Want the whole set? <span className="font-medium">Batch up to 50 photos</span> from this pack.
                  </span>
                  <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </>
            )}
            <PromptField
              value={prompt}
              onChange={setPrompt}
              modelId={modelId}
              label="Extra details (optional)"
              placeholder="e.g. wearing a navy blazer, slight smile"
              onSubmitShortcut={() => void onSubmit()}
            />
          </TabsContent>

          <TabsContent value="reference" className="flex flex-col gap-4">
            <ReferencePicker value={reference} onValueChange={setReference} />
            <PromptField
              value={prompt}
              onChange={setPrompt}
              modelId={modelId}
              required
              label="Describe the scene"
              placeholder="e.g. me in this pose on a rooftop at golden hour"
              hint="The reference guides pose, framing and style; your prompt sets the scene."
              onSubmitShortcut={() => void onSubmit()}
            />
          </TabsContent>
        </Tabs>

        <section className="flex flex-col gap-5 rounded-xl border bg-card p-4 shadow-xs" aria-label="Photo settings">
          <AspectRatioPicker value={aspectRatio} onValueChange={setAspectRatio} />
          <CountPicker value={numImages} onValueChange={setNumImages} />
          <QualityControl value={quality} onValueChange={setQuality} mode={identityMode} draftsLeft={draftsLeft} />
          <BrandKitSelect value={brandKitId} onChange={setBrandKitId} />
          <details className="rounded-lg border px-3 py-2 text-sm">
            <summary className="cursor-pointer rounded-sm font-medium outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              Advanced
            </summary>
            <div className="mt-3 flex flex-col gap-2 pb-1">
              <Label htmlFor={`${formId}-seed`}>Seed</Label>
              <Input
                id={`${formId}-seed`}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Random"
                value={seed}
                onChange={(e) => setSeed(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
                aria-describedby={`${formId}-seed-hint`}
              />
              <p id={`${formId}-seed-hint`} className="text-xs text-muted-foreground">
                Reuse a seed to get a similar composition again. Leave empty for variety.
              </p>
            </div>
          </details>
        </section>

        <ApiErrorAlert error={error} onDismiss={() => setError(null)} />

        <div className="flex flex-col gap-3">
          <CostHint credits={cost} />
          {submitButton("hidden w-full md:inline-flex")}
          <p className="hidden text-xs text-muted-foreground md:block">
            Tip: press <kbd className="rounded border px-1 font-sans">Ctrl/⌘</kbd> +{" "}
            <kbd className="rounded border px-1 font-sans">Enter</kbd> in the prompt to generate. Failed or blocked photos
            are refunded automatically.
          </p>
        </div>
      </form>

      <section ref={resultsRef} aria-labelledby={`${formId}-results`} className="flex scroll-mt-20 flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${formId}-results`} className="text-lg font-semibold">
            Results
          </h2>
          {session.entries.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={session.clear}>
              <TrashIcon />
              Clear list
            </Button>
          )}
        </div>
        {session.entries.length === 0 ? (
          <EmptyState
            icon={<SparklesIcon />}
            title="Your photos will appear here"
            description="Drafts are free and take seconds. The best shots are shown first; re-render your favorites at full quality."
          />
        ) : (
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
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {session.announcement}
        </p>
      </section>

      <StickyActionBar>
        <div className="flex min-w-0 flex-1 flex-col text-xs leading-tight">
          <span className="font-semibold tabular-nums">{cost === 0 ? "Free" : `${cost} ${plural(cost, "credit")}`}</span>
          <span className="truncate text-muted-foreground">
            {quality === "draft" ? `${draftsLeft} free ${plural(draftsLeft, "draft")} left today` : "Refunded if it fails"}
          </span>
        </div>
        {submitButton("h-11 flex-1")}
      </StickyActionBar>
      <StickyActionBarSpacer />
    </div>
  );
}

function jobTitle(opts: { mode: CreateMode; prompt: string; pack?: PackSummary; quality: Quality }): string {
  const q = opts.quality === "draft" ? "Drafts" : opts.quality === "high" ? "High quality" : "Photos";
  const text = opts.prompt.trim().replace(/\s+/g, " ");
  const snippet = text.length > 60 ? `${text.slice(0, 59).trimEnd()}…` : text;
  if (opts.mode === "pack" && opts.pack) return `${q} · ${opts.pack.emoji ?? ""} ${opts.pack.name}`.replace(/\s+/g, " ");
  if (opts.mode === "reference") return `${q} · Style reference${snippet ? ` · ${snippet}` : ""}`;
  return `${q} · ${snippet}`;
}

/** On phones the results sit below the form: bring them into view after submitting. */
function scrollToResults(el: HTMLElement | null) {
  if (!el || typeof window === "undefined" || !window.matchMedia("(max-width: 1023px)").matches) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}
