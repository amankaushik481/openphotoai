"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowRightIcon,
  CheckIcon,
  ShieldCheckIcon,
  ClapperboardIcon,
  CoinsIcon,
  ImagesIcon,
  LayersIcon,
  PersonStandingIcon,
  ScanFaceIcon,
  ShirtIcon,
  SparklesIcon,
  UsersRoundIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/empty-state";
import { MediaGrid } from "@/components/app/media-grid";
import {
  ONBOARDING_STEPS,
  onboardingState,
  type OnboardingState,
  type OnboardingStepId,
} from "@/components/app/onboarding";
import { useMe } from "@/hooks/use-me";
import { useModels } from "@/hooks/use-models";
import { ApiClientError, api, fetcher } from "@/lib/api-client";
import type { MediaDTO } from "@/types/domain";
import { errorMessage } from "@/i18n";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

const RECENT_KEY = "/api/media?limit=12";

const QUICK_ACTIONS = [
  { href: "/app/create", icon: SparklesIcon, title: "dashboard.actions.create", body: "dashboard.actions.createBody" },
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
    <div className="flex flex-col gap-10">
      {onboarding && <OnboardingCard state={onboarding} />}

      <section aria-label={t("credits.label")} className="grid gap-4 sm:grid-cols-2">
        <StatCard
          icon={<CoinsIcon />}
          label={t("credits.label")}
          value={meLoading && !user ? null : (user?.credits ?? 0).toLocaleString(t.locale)}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/app/billing">{t("credits.buy")}</Link>
            </Button>
          }
        />
        <StatCard
          icon={<ScanFaceIcon />}
          label={t("nav.models")}
          value={modelsLoading && !models ? null : String(readyModels)}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={hasModels ? "/app/models" : "/app/models/new"}>
                {hasModels ? t("common.viewAll") : t("dashboard.createModelCta")}
              </Link>
            </Button>
          }
        />
      </section>

      <section aria-labelledby="quick-actions">
        <h2 id="quick-actions" className="mb-4 text-lg font-semibold">
          {t("dashboard.quickActions")}
        </h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {QUICK_ACTIONS.map(({ href, icon: Icon, title, body }) => (
            <li key={href}>
              <Link
                href={href}
                className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-primary/40 hover:bg-accent/40 sm:flex-row sm:items-center"
              >
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground"
                >
                  <Icon className="size-5" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{t(title)}</span>
                  <span className="text-sm text-muted-foreground">{t(body)}</span>
                </span>
                <ArrowRightIcon
                  aria-hidden="true"
                  className="ml-auto hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* While the first-run card is up it holds the one next action; the empty grid doesn't repeat it. */}
      <RecentMedia showCreateAction={!onboarding} />
    </div>
  );
}

const ONBOARDING_TITLES: Record<OnboardingStepId, string> = {
  model: "Create your model",
  photos: "Pick up where you left off",
  train: "Your model is training",
  create: "Time for your first shoot",
};

/** First-run path: where the user stands, the one next action, and why consent matters. */
function OnboardingCard({ state }: { state: OnboardingState }) {
  const t = useT();
  const title = state.step === "model" && state.model ? ONBOARDING_TITLES.photos : ONBOARDING_TITLES[state.step];
  return (
    <section
      aria-labelledby="onboarding-title"
      className="border-brand-gradient grain relative overflow-hidden rounded-2xl p-5 sm:p-8"
    >
      {/* Phones: the next action comes right after the intro; wider screens show the path first. */}
      <div className="flex flex-col gap-5">
        <div className="order-1 flex flex-col gap-1.5">
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">
            Get started · step {state.current + 1} of {ONBOARDING_STEPS.length}
          </p>
          <h2 id="onboarding-title" className="font-display text-3xl leading-tight">
            {title}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            {state.status ?? t("dashboard.createModelBody")}
          </p>
        </div>

        <ol className="order-3 grid gap-2 sm:order-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Your first steps">
          {ONBOARDING_STEPS.map((step, i) => {
            const done = i < state.current;
            const active = i === state.current;
            return (
              <li
                key={step.id}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex gap-3 rounded-xl border p-2.5 transition-colors sm:p-3",
                  active ? "border-primary/50 bg-card shadow-xs" : "border-transparent bg-card/50",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    done
                      ? "bg-success text-success-foreground"
                      : active
                        ? "bg-brand-gradient text-white"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <CheckIcon className="size-4" /> : i + 1}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn("text-sm font-medium", !done && !active && "text-muted-foreground")}>
                    {step.title}
                    <span className="sr-only">{done ? " (done)" : active ? " (next)" : ""}</span>
                  </span>
                  <span className={cn("text-xs text-muted-foreground", !active && "hidden sm:block")}>{step.body}</span>
                </span>
              </li>
            );
          })}
        </ol>

        <div className="order-2 flex flex-col gap-3 sm:order-3 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="brand" size="lg" className="w-full sm:w-auto">
            <Link href={state.cta.href}>
              {state.step === "create" ? <SparklesIcon /> : <ScanFaceIcon />}
              {state.cta.label}
            </Link>
          </Button>
          <p className="flex items-start gap-2 text-xs text-muted-foreground sm:max-w-sm">
            <ShieldCheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            Private by design: models need the live consent of the person in them, and you can delete yours any time.
          </p>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-xs">
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground [&_svg]:size-5"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm text-muted-foreground">{label}</span>
        {value === null ? (
          <Skeleton className="mt-1 h-7 w-16" />
        ) : (
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
        )}
      </div>
      <div className="ml-auto">{action}</div>
    </div>
  );
}

/** The newest media (shared by the recent grid and the first-run card). */
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
      icon={<ImagesIcon />}
      title={t("dashboard.recentEmptyTitle")}
      description={t("dashboard.recentEmptyBody")}
      action={
        showCreateAction ? (
          <Button asChild variant="brand">
            <Link href="/app/create">
              <SparklesIcon />
              {t("dashboard.actions.create")}
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <section aria-labelledby="recent-media">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="recent-media" className="text-lg font-semibold">
          {t("media.recent")}
        </h2>
        {media.length > 0 && (
          <Button asChild variant="link" size="sm" className="px-0">
            <Link href="/app/gallery">
              {t("common.viewAll")}
              <ArrowRightIcon />
            </Link>
          </Button>
        )}
      </div>
      {error ? (
        empty
      ) : (
        <MediaGrid
          media={media}
          loading={isLoading}
          onToggleFavorite={toggleFavorite}
          empty={empty}
          className={cn(isLoading && "min-h-48")}
        />
      )}
    </section>
  );
}
