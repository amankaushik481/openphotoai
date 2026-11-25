"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowRightIcon,
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
  { href: "/app/together", icon: UsersRoundIcon, title: "dashboard.actions.together", body: "dashboard.actions.togetherBody" },
] as const;

export function DashboardOverview() {
  const t = useT();
  const { user, isLoading: meLoading } = useMe();
  const { models, isLoading: modelsLoading } = useModels();
  const readyModels = models?.filter((m) => m.status === "ready" && !m.shared).length ?? 0;
  const hasModels = (models?.filter((m) => !m.shared).length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-10">
      {!modelsLoading && models && !hasModels && <CreateModelCta />}

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

      <RecentMedia />
    </div>
  );
}

function CreateModelCta() {
  const t = useT();
  return (
    <section className="border-brand-gradient grain relative overflow-hidden rounded-2xl p-6 sm:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 -z-10 size-72 rounded-full bg-brand-gradient opacity-20 blur-3xl"
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <h2 className="font-display text-3xl leading-tight">{t("dashboard.createModelTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">{t("dashboard.createModelBody")}</p>
        </div>
        <Button asChild variant="brand" size="lg" className="shrink-0">
          <Link href="/app/models/new">
            <ScanFaceIcon />
            {t("dashboard.createModelCta")}
          </Link>
        </Button>
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
    // flex-wrap: in narrow columns (tablet with sidebar) the action drops below instead of covering the value.
    <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5 shadow-xs">
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

function RecentMedia() {
  const t = useT();
  const { data, error, isLoading, mutate } = useSWR<{ media: MediaDTO[]; nextCursor: string | null }>(
    RECENT_KEY,
    fetcher,
    // A missing route (404) or empty gallery is not worth retrying.
    { shouldRetryOnError: (err) => !(err instanceof ApiClientError && err.status < 500), revalidateOnFocus: false },
  );
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
          optimisticData: (current) => (current ? { ...current, media: optimistic(current.media) } : { media: [], nextCursor: null }),
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
        <Button asChild variant="brand">
          <Link href="/app/create">
            <SparklesIcon />
            {t("dashboard.actions.create")}
          </Link>
        </Button>
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
