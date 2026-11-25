"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ApertureIcon,
  ArrowRightIcon,
  ClapperboardIcon,
  FilmIcon,
  LayersIcon,
  PersonStandingIcon,
  ScanFaceIcon,
  ShieldCheckIcon,
  ShirtIcon,
  UsersRoundIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sprockets } from "@/components/ui/darkroom";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactSheet } from "@/components/app/contact-sheet";
import { EmptyState } from "@/components/app/empty-state";
import {
  ONBOARDING_STEPS,
  onboardingState,
  type OnboardingState,
  type OnboardingStepId,
} from "@/components/app/onboarding";
import { TYPICAL_TRAINING_MINUTES } from "@/components/models/training-eta";
import { useMe } from "@/hooks/use-me";
import { useModels } from "@/hooks/use-models";
import { ApiClientError, api, fetcher } from "@/lib/api-client";
import type { MediaDTO } from "@/types/domain";
import { errorMessage } from "@/i18n";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

const RECENT_KEY = "/api/media?limit=12";

const QUICK_ACTIONS = [
  { href: "/app/create", icon: ApertureIcon, title: "dashboard.actions.create", body: "dashboard.actions.createBody" },
  { href: "/app/packs", icon: LayersIcon, title: "dashboard.actions.packs", body: "dashboard.actions.packsBody" },
  { href: "/app/pose", icon: PersonStandingIcon, title: "dashboard.actions.pose", body: "dashboard.actions.poseBody" },
  { href: "/app/video", icon: ClapperboardIcon, title: "dashboard.actions.video", body: "dashboard.actions.videoBody" },
  { href: "/app/try-on", icon: ShirtIcon, title: "dashboard.actions.tryOn", body: "dashboard.actions.tryOnBody" },
  {
    href: "/app/together",
    icon: UsersRoundIcon,
    title: "dashboard.actions.together",
    body: "dashboard.actions.togetherBody",
  },
] as const;

export function DashboardOverview() {
  const t = useT();
  const { user, isLoading: meLoading } = useMe();
  const { models, isLoading: modelsLoading } = useModels();
  const { data: recent } = useRecentMedia();
  const readyModels = models?.filter((m) => m.status === "ready" && !m.shared).length ?? 0;
  const hasModels = (models?.filter((m) => !m.shared).length ?? 0) > 0;
  const onboarding = onboardingState(models, recent ? recent.media.length > 0 : undefined);

  return (
    <div className="flex flex-col gap-12">
      {onboarding && <OnboardingCard state={onboarding} />}

      {/* Light-meter readouts: the two numbers that decide what you can shoot next. */}
      <section
        aria-label={t("credits.label")}
        className="grid grid-cols-2 divide-x divide-border border-y border-border"
      >
        <Readout
          label={t("credits.label")}
          value={meLoading && !user ? null : (user?.credits ?? 0).toLocaleString(t.locale)}
          unit="CR"
          action={<Link href="/app/billing">{t("credits.buy")}</Link>}
        />
        <Readout
          label={`${t("nav.models")} · ready`}
          value={modelsLoading && !models ? null : String(readyModels).padStart(2, "0")}
          action={
            <Link href={hasModels ? "/app/models" : "/app/models/new"}>
              {hasModels ? t("common.viewAll") : t("dashboard.createModelCta")}
            </Link>
          }
          className="pl-4 sm:pl-8"
        />
      </section>

      {/* While the first-run card is up it holds the one next action; the empty sheet doesn't repeat it. */}
      <RecentMedia showCreateAction={!onboarding} />

      <section aria-labelledby="quick-actions">
        <SectionHead id="quick-actions" no="02" title={t("dashboard.quickActions")} />
        {/* An editorial index, not a card grid: numbered rows on hairlines. */}
        <ul className="grid sm:grid-cols-2 sm:gap-x-10">
          {QUICK_ACTIONS.map(({ href, icon: Icon, title, body }, i) => (
            <li key={href} className="border-b border-border">
              <Link
                href={href}
                className="group flex items-center gap-4 rounded-xs py-3.5 [--focus-offset:-2px] sm:py-4"
              >
                <span aria-hidden="true" className="w-5 font-mono text-[0.6875rem] text-foreground/45">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-foreground/40">
                    {t(title)}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">{t(body)}</span>
                </span>
                <ArrowRightIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-safelight-ink"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** A section head on a hairline: mono folio, serif title, optional action on the right. */
function SectionHead({
  id,
  no,
  title,
  action,
}: {
  id: string;
  no: string;
  title: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 sm:mb-5">
      <h2 id={id} className="flex items-baseline gap-3">
        <span aria-hidden="true" className="mono-caps text-safelight-ink">
          No. {no}
        </span>
        <span className="font-display text-[1.75rem] leading-none tracking-[-0.01em] sm:text-[2rem]">{title}</span>
      </h2>
      {action}
    </div>
  );
}

function Readout({
  label,
  value,
  unit,
  action,
  className,
}: {
  label: string;
  value: string | null;
  unit?: string;
  action: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 py-4 pr-4 sm:py-5", className)}>
      <span className="mono-caps text-muted-foreground">{label}</span>
      {value === null ? (
        <Skeleton className="h-9 w-20" />
      ) : (
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-[2rem] leading-none font-medium tracking-[-0.03em] tabular-nums sm:text-[2.5rem]">
            {value}
          </span>
          {unit && (
            <span aria-hidden="true" className="font-mono text-[0.6875rem] tracking-[0.14em] text-muted-foreground">
              {unit}
            </span>
          )}
        </span>
      )}
      <span className="text-sm [&_a]:rounded-xs [&_a]:underline [&_a]:decoration-foreground/35 [&_a]:underline-offset-[5px] [&_a:hover]:decoration-safelight-ink">
        {action}
      </span>
    </div>
  );
}

const ONBOARDING_TITLES: Record<OnboardingStepId, string> = {
  model: "Create your model",
  photos: "Pick up where you left off",
  train: "Your model is training",
  create: "Time for your first shoot",
};

/** Minutes as darkroom-timer numerals: 20 → "00:20:00". */
function timer(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`;
}

/**
 * The first-run path as the darkroom process the landing page promises: Expose (consent selfie + your
 * photos) → Develop (Instant or Trained) → Print (your first photos). The four onboarding steps map onto
 * those three frames; each frame is a negative until its step is done, then turns positive.
 */
const PROCESS: readonly { name: string; steps: readonly OnboardingStepId[]; meta: string }[] = [
  { name: "Expose", steps: ["model", "photos"], meta: "Selfie + photos" },
  {
    name: "Develop",
    steps: ["train"],
    meta: `Instant: seconds · Trained ≈ ${timer(TYPICAL_TRAINING_MINUTES)}`,
  },
  { name: "Print", steps: ["create"], meta: "Drafts are free" },
];

/** First-run path: where the user stands, the one next action, and why consent matters. */
function OnboardingCard({ state }: { state: OnboardingState }) {
  const t = useT();
  const title = state.step === "model" && state.model ? ONBOARDING_TITLES.photos : ONBOARDING_TITLES[state.step];
  const stepIndex = (id: OnboardingStepId) => ONBOARDING_STEPS.findIndex((s) => s.id === id);
  return (
    <section
      aria-labelledby="onboarding-title"
      className="grain relative overflow-hidden rounded-xs border border-foreground/15 bg-card p-5 shadow-[0_18px_30px_-26px_rgb(0_0_0/0.5)] sm:p-8"
    >
      {/* Phones: the next action comes right after the intro; wider screens show the process first. */}
      <div className="flex flex-col gap-6">
        <div className="order-1 flex flex-col gap-2">
          <p className="mono-caps text-safelight-ink">
            First roll · step {state.current + 1} of {ONBOARDING_STEPS.length}
          </p>
          <h2 id="onboarding-title" className="font-display text-[2.25rem] leading-[0.95] tracking-[-0.015em] sm:text-5xl">
            {title}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            {state.status ?? t("dashboard.createModelBody")}
          </p>
        </div>

        {/* The film strip: three frames on a dark rebate with sprocket holes. */}
        <div className="order-3 overflow-hidden rounded-[1px] bg-darkroom px-2 py-2.5 text-darkroom-foreground sm:order-2 sm:px-3">
          <Sprockets className="text-darkroom-foreground/25" />
          <ol className="my-2.5 grid gap-2 sm:grid-cols-3" aria-label="Your first steps">
            {PROCESS.map((stage, i) => {
              const indexes = stage.steps.map(stepIndex);
              const done = indexes.every((n) => n < state.current);
              const active = indexes.includes(state.current);
              return (
                <li
                  key={stage.name}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "relative flex min-h-36 flex-col gap-2 rounded-[1px] border p-3.5 sm:p-4",
                    done && "border-transparent bg-darkroom-foreground text-darkroom",
                    active && "border-darkroom-safelight shadow-[0_0_24px_-10px_var(--darkroom-safelight)]",
                    !done && !active && "border-dashed border-darkroom-line text-darkroom-muted",
                  )}
                >
                  <span className="flex items-center justify-between font-mono text-[0.625rem] leading-none tracking-[0.18em] uppercase">
                    <span className={cn(done ? "text-darkroom/60" : "text-darkroom-safelight")}>No. {String(i + 1).padStart(2, "0")}</span>
                    <span className={cn(active && "text-darkroom-safelight")}>{done ? "✓ Done" : active ? "▸ Now" : "Next"}</span>
                  </span>
                  <span className="font-display text-[2rem] leading-none">
                    {stage.name}
                    <span className="sr-only">{done ? " (done)" : active ? " (next)" : ""}</span>
                  </span>
                  <ul className="flex flex-col gap-1 text-[0.8125rem] leading-snug">
                    {stage.steps.map((id) => {
                      const step = ONBOARDING_STEPS[stepIndex(id)]!;
                      const stepDone = stepIndex(id) < state.current;
                      const stepActive = stepIndex(id) === state.current;
                      return (
                        <li key={id} className="flex flex-col">
                          <span className={cn(stepActive && "font-medium text-darkroom-foreground")}>
                            <span aria-hidden="true" className="inline-block w-4 font-mono">
                              {stepDone ? "✓" : stepActive ? "▸" : "·"}
                            </span>
                            {step.title}
                          </span>
                          {stepActive && <span className="pl-4 text-darkroom-muted">{step.body}</span>}
                        </li>
                      );
                    })}
                  </ul>
                  <span
                    className={cn(
                      "mt-auto pt-1 font-mono text-[0.625rem] tracking-[0.14em] uppercase",
                      done ? "text-darkroom/60" : "text-darkroom-muted",
                    )}
                  >
                    {stage.meta}
                  </span>
                </li>
              );
            })}
          </ol>
          <Sprockets className="text-darkroom-foreground/25" />
        </div>

        <div className="order-2 flex flex-col gap-3 sm:order-3 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="brand" size="lg" className="w-full sm:w-auto">
            <Link href={state.cta.href}>
              {state.step === "create" ? <ApertureIcon /> : <ScanFaceIcon />}
              {state.cta.label}
            </Link>
          </Button>
          <p className="flex items-start gap-2 text-xs text-muted-foreground sm:max-w-sm">
            <ShieldCheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-safelight-ink" />
            Private by design: models need the live consent of the person in them, and you can delete yours any time.
          </p>
        </div>
      </div>
    </section>
  );
}

/** The newest media (shared by the recent contact sheet and the first-run card). */
function useRecentMedia() {
  return useSWR<{ media: MediaDTO[]; nextCursor: string | null }>(
    RECENT_KEY,
    fetcher,
    // A missing route (404) or empty gallery is not worth retrying.
    { shouldRetryOnError: (err) => !(err instanceof ApiClientError && err.status < 500), revalidateOnFocus: false },
  );
}

function RecentMedia({ showCreateAction }: { showCreateAction: boolean }) {
  const t = useT();
  const { data, error, isLoading, mutate } = useRecentMedia();
  const media = data?.media ?? [];

  async function toggleFavorite(item: MediaDTO, next: boolean) {
    const optimistic = (list: MediaDTO[]) => list.map((m) => (m.id === item.id ? { ...m, isFavorite: next } : m));
    try {
      await mutate(
        async (current) => {
          await api(`/api/media/${item.id}`, { method: "PATCH", body: { isFavorite: next } });
          return current ? { ...current, media: optimistic(current.media) } : current;
        },
        {
          optimisticData: (current) =>
            current ? { ...current, media: optimistic(current.media) } : { media: [], nextCursor: null },
          rollbackOnError: true,
          revalidate: false,
        },
      );
    } catch (err) {
      toast.error(err instanceof ApiClientError ? errorMessage(err.code) : t("errors.generic"));
    }
  }

  const empty = (
    <EmptyState
      icon={<FilmIcon />}
      title={t("dashboard.recentEmptyTitle")}
      description={t("dashboard.recentEmptyBody")}
      action={
        showCreateAction ? (
          <Button asChild variant="brand">
            <Link href="/app/create">
              <ApertureIcon />
              {t("dashboard.actions.create")}
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <section aria-labelledby="recent-media">
      <SectionHead
        id="recent-media"
        no="01"
        title={t("media.recent")}
        action={
          media.length > 0 ? (
            <Button asChild variant="link" size="sm" className="h-auto px-0">
              <Link href="/app/gallery">
                {t("common.viewAll")}
                <ArrowRightIcon />
              </Link>
            </Button>
          ) : undefined
        }
      />
      {error ? empty : <ContactSheet media={media} loading={isLoading} onToggleFavorite={toggleFavorite} empty={empty} />}
    </section>
  );
}
