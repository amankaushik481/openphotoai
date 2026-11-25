"use client";

import * as React from "react";
import Link from "next/link";
import { ApertureIcon, ArrowRightIcon, FilmIcon, ImageIcon, LayersIcon, LoaderCircleIcon, TrashIcon, TypeIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AspectRatioPicker } from "@/components/app/aspect-ratio-picker";
import { CostHint } from "@/components/app/cost-hint";
import { EmptyState } from "@/components/app/empty-state";
import { ModelPicker } from "@/components/app/model-picker";
import { BrandKitSelect, useBrandKits } from "@/components/teams/brand-kit-select";
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
import {
  CREATE_PROMPT_KEY,
  CREATE_SETTINGS_KEY,
  initialCreateSettings,
  parseCreateSettings,
  serializeCreateSettings,
  submitBlockReason,
  type CreateSettings,
} from "@/components/create/persist";
import { useStoredValue, writeStored } from "@/components/create/use-stored";
import { PromptField } from "@/components/create/prompt-field";
import { ReferencePicker, type ReferenceUpload } from "@/components/create/reference-picker";
import { useDraftAllowance } from "@/components/create/use-draft-allowance";
import { useGenerationSession } from "@/components/create/use-generation-session";
import { useModelModes } from "@/components/create/use-model-modes";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";
import type { AspectRatio, IdentityModelDTO, Quality } from "@/types/domain";
import type { PackSummary } from "@/types/pack";

export interface CreateStudioProps {
  packs: PackSummary[];
  /** Optional fallback: identity mode per model id (the models list's `mode` takes precedence). */
  modelModes?: Record<string, IdentityMode>;
  /** Server-rendered allowance, used until /api/me (`draftsRemaining`) loads. */
  drafts: { limit: number; remaining: number };
  initial?: { mode?: CreateMode; packId?: string; modelId?: string; prompt?: string };
}

const MODES: { value: CreateMode; label: string; icon: typeof TypeIcon }[] = [
  { value: "prompt", label: "Prompt", icon: TypeIcon },
  { value: "pack", label: "Pack", icon: LayersIcon },
  { value: "reference", label: "Style reference", icon: ImageIcon },
];

const NEXT_PATH = "/app/create";

/** One-tap starters for an empty prompt (the helper's "Improve" makes them detailed). */
const PROMPT_STARTERS = [
  "Professional headshot, modern office",
  "Golden hour on a rooftop",
  "Candid in a cozy café",
  "Hiking in the mountains",
] as const;

export function CreateStudio({ packs, modelModes: fallbackModes, drafts, initial }: CreateStudioProps) {
  const t = useT();
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
  const { draftsLeft, spend: spendDraft, exhaust: exhaustDrafts } = useDraftAllowance(drafts.remaining);
  const [quality, setQuality] = React.useState<Quality>(drafts.remaining > 0 ? "draft" : "standard");
  const [seed, setSeed] = React.useState("");
  const [brandKitId, setBrandKitId] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);
  // Synchronous double-submit guard (Ctrl+Enter auto-repeat, double taps): state updates lag a render.
  const submittingRef = React.useRef(false);
  const [error, setError] = React.useState<FriendlyError | null>(null);

  const session = useGenerationSession({ nextPath: NEXT_PATH, persistKey: "create" });
  useRememberedSettings({
    initial,
    draftsLeft,
    values: { modelId, mode, aspectRatio, numImages, quality, prompt },
    apply: (saved) => {
      if (saved.modelId) setModelId(saved.modelId);
      if (saved.mode) setMode(saved.mode);
      if (saved.aspectRatio) setAspectRatio(saved.aspectRatio);
      if (saved.numImages) setNumImages(saved.numImages);
      if (saved.quality) setQuality(saved.quality);
      if (saved.prompt) setPrompt(saved.prompt);
    },
  });
  const { brandKits } = useBrandKits();
  const { modes: modelModes, models } = useModelModes(fallbackModes);
  // A `?model=` deep link to a model that isn't one of the user's own: let the picker choose instead.
  const unknownModel = Boolean(modelId && !model && models && !models.some((m) => m.id === modelId && !m.shared));
  if (unknownModel) setModelId(null);
  const identityMode = resolveIdentityMode(model ?? (modelId ? { id: modelId } : null), modelModes);
  const cost = generateCost({ quality, numImages, mode: identityMode });
  const selectedPack = packs.find((p) => p.slug === packId);
  // The daily allowance counts draft images, so a 4-draft request needs 4 left.
  const draftBlocked = quality === "draft" && draftsLeft < numImages;
  const blockReason = submitBlockReason({ models, modelId, quality, numImages, draftsLeft });

  const submitLabel = submitting
    ? "Starting…"
    : `Generate ${numImages} ${quality === "draft" ? plural(numImages, "draft") : plural(numImages, "photo")}`;

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (submittingRef.current) return;
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

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await session.submit(built.body, jobTitle({ mode, prompt, pack: selectedPack, quality }));
      if (quality === "draft") spendDraft(numImages);
      scrollToResults(resultsRef.current);
    } catch (err) {
      const friendly = describeApiError(err, { draft: quality === "draft", nextPath: NEXT_PATH });
      setError(friendly);
      if (friendly.code === "rate_limited" && quality === "draft") {
        exhaustDrafts();
        setQuality("standard");
      }
    } finally {
      submittingRef.current = false;
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
      aria-describedby={blockReason ? `${formId}-block-reason` : undefined}
      className={className}
    >
      {submitting ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : <ApertureIcon aria-hidden="true" />}
      {submitLabel}
    </Button>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
      {/* The studio control panel: numbered mono sections on one sheet of paper, hairlines between them. */}
      <form
        id={formId}
        onSubmit={onSubmit}
        noValidate
        aria-label="Create photos"
        className="flex flex-col self-start rounded-xs border border-foreground/15 bg-card"
      >
        <section className={panelSection}>
          <PanelLabel no="01" label="Subject" />
          <ModelPicker
            value={modelId}
            includeShared={false}
            hideLabel
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
          className={cn(panelSection, "gap-4")}
        >
          <PanelLabel no="02" label="Source" />
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
              starters={PROMPT_STARTERS}
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
                  className="flex items-center gap-3 rounded-xs border border-dashed border-foreground/25 p-3 text-sm transition-colors hover:border-foreground/50 hover:bg-foreground/[0.03]"
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

        <section className={cn(panelSection, "gap-5")} aria-label="Photo settings">
          <PanelLabel no="03" label="Exposure" />
          <AspectRatioPicker value={aspectRatio} onValueChange={setAspectRatio} />
          <CountPicker value={numImages} onValueChange={setNumImages} />
          <QualityControl value={quality} onValueChange={setQuality} mode={identityMode} draftsLeft={draftsLeft} />
          <BrandKitSelect
            value={brandKitId}
            onChange={(id) => {
              setBrandKitId(id);
              // Single jobs use the request's ratio, so adopt the kit's (batches apply it server-side).
              const kit = id ? brandKits?.find((k) => k.id === id) : undefined;
              if (kit) setAspectRatio(kit.aspectRatio);
            }}
          />
          <details className="border-t border-border pt-3 text-sm">
            <summary className="cursor-pointer rounded-xs font-mono text-[0.6875rem] font-medium tracking-[0.16em] text-muted-foreground uppercase select-none">
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

        {error && (
          <div className={panelSection}>
            <ApiErrorAlert error={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {/* Release: the cost as a meter readout beside the big safelight Generate button. */}
        <div className={cn(panelSection, "gap-3 bg-background/50 dark:bg-transparent")}>
          <div className="flex items-end gap-4">
            <CostHint credits={cost} variant="readout" className="shrink-0" />
            {submitButton("hidden h-14 flex-1 text-base md:inline-flex")}
          </div>
          {blockReason && (
            <p id={`${formId}-block-reason`} className="text-sm text-muted-foreground" role="status">
              {blockReason}
            </p>
          )}
          <p className="hidden text-xs text-muted-foreground md:block">
            Tip: press <kbd className="rounded-xs border px-1 font-mono text-[0.6875rem]">Ctrl/⌘</kbd> +{" "}
            <kbd className="rounded-xs border px-1 font-mono text-[0.6875rem]">Enter</kbd> in the prompt to generate. Failed
            or blocked photos are refunded automatically.
          </p>
        </div>
      </form>

      <section ref={resultsRef} aria-labelledby={`${formId}-results`} className="flex scroll-mt-20 flex-col gap-4">
        <div className="flex items-end justify-between gap-3 border-b border-border pb-2">
          <h2 id={`${formId}-results`} className="flex items-baseline gap-3">
            <span aria-hidden="true" className="mono-caps text-safelight-ink">
              The tray
            </span>
            <span className="font-display text-[1.75rem] leading-none">Results</span>
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
            icon={<FilmIcon />}
            title={t("empty.createResults")}
            description={t("empty.createResultsBody")}
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
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs leading-tight">
          <span className="font-mono text-base leading-none font-medium tabular-nums">
            {cost === 0 ? "Free" : `${cost} ${plural(cost, "credit")}`}
          </span>
          <span className={cn("text-muted-foreground", blockReason ? "line-clamp-2" : "truncate")}>
            {blockReason ??
              (quality === "draft" ? `${draftsLeft} free ${plural(draftsLeft, "draft")} left today` : "Refunded if it fails")}
          </span>
        </div>
        {submitButton("h-11 flex-1")}
      </StickyActionBar>
      <StickyActionBarSpacer />
    </div>
  );
}

/** One section of the control panel (hairline between sections). */
const panelSection = "flex flex-col gap-2 border-t border-border p-4 first:border-t-0 sm:p-5";

/** "01 · Subject": the mono label that opens each panel section. */
function PanelLabel({ no, label }: { no: string; label: string }) {
  return (
    <p aria-hidden="true" className="mono-caps -mt-0.5 mb-1 flex items-center gap-2 text-muted-foreground">
      <span className="text-safelight-ink">{no}</span>
      {label}
      <span className="h-px flex-1 bg-border" />
    </p>
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

type RememberedValues = Omit<CreateSettings, "modelId"> & { modelId: string | null; prompt: string };

/**
 * Remember the last settings in this browser (localStorage) and the unsent prompt in this tab
 * (sessionStorage). Restored once the browser can read them (not during SSR); deep links win.
 */
function useRememberedSettings({
  initial,
  draftsLeft,
  values,
  apply,
}: {
  initial: CreateStudioProps["initial"];
  draftsLeft: number;
  values: RememberedValues;
  apply: (saved: Partial<CreateSettings> & { prompt?: string }) => void;
}) {
  // Null during SSR + hydration; the stored values once the browser can read them.
  const storedSettings = useStoredValue("local", CREATE_SETTINGS_KEY, parseCreateSettings);
  const storedPrompt = useStoredValue("session", CREATE_PROMPT_KEY, (raw) => (raw ?? "").slice(0, 1500));
  const [restored, setRestored] = React.useState(false);
  if (storedSettings !== null && storedPrompt !== null && !restored) {
    // Once, while rendering (React re-renders before painting); later choices are the user's.
    setRestored(true);
    const saved: Partial<CreateSettings> & { prompt?: string } = initialCreateSettings(storedSettings, {
      draftsLeft,
      deepLink: { modelId: initial?.modelId, mode: initial?.mode ?? (initial?.packId ? "pack" : undefined) },
    });
    if (storedPrompt.trim() && !initial?.prompt) saved.prompt = storedPrompt;
    apply(saved);
  }

  const { modelId, mode, aspectRatio, numImages, quality, prompt } = values;
  React.useEffect(() => {
    if (!restored) return;
    const settings: Partial<CreateSettings> = { ...(modelId ? { modelId } : {}), mode, aspectRatio, numImages, quality };
    writeStored("local", CREATE_SETTINGS_KEY, settings, serializeCreateSettings);
  }, [restored, modelId, mode, aspectRatio, numImages, quality]);
  React.useEffect(() => {
    if (!restored) return;
    writeStored("session", CREATE_PROMPT_KEY, prompt, (text) => (text.trim() ? text : null));
  }, [restored, prompt]);
}
