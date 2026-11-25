"use client";

import Link from "next/link";
import { HeartIcon, PlayIcon } from "lucide-react";

import { EdgePrint, GreasePencilCircle } from "@/components/ui/darkroom";
import { Skeleton } from "@/components/ui/skeleton";
import type { MediaDTO } from "@/types/domain";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

/** "01", "02"… as printed under each frame. */
export function frameNumber(i: number): string {
  return String(i + 1).padStart(2, "0");
}

function duration(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Recent work as a proof sheet: uniform frames cropped to 4:5 on a sheet of paper, the roll's edge print
 * along the top, mono frame numbers underneath and a red grease-pencil loop around the keepers (favorites).
 * Media the best-shots picker hid are left off, like the gallery's default view.
 */
export function ContactSheet({
  media,
  loading = false,
  skeletonCount = 6,
  onToggleFavorite,
  empty,
  className,
}: {
  media: readonly MediaDTO[];
  loading?: boolean;
  skeletonCount?: number;
  onToggleFavorite?: (media: MediaDTO, next: boolean) => void;
  empty?: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  const visible = media.filter((m) => !m.hidden);

  if (!loading && visible.length === 0) return <>{empty ?? null}</>;

  const grid = "grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 sm:gap-x-3 lg:grid-cols-6";
  return (
    <div
      className={cn(
        "rounded-xs border border-foreground/12 bg-card p-3 shadow-[0_18px_30px_-26px_rgb(0_0_0/0.5)] sm:p-5",
        className,
      )}
      aria-busy={loading && visible.length === 0 ? true : undefined}
    >
      <EdgePrint frame={visible.length ? frameNumber(visible.length - 1) : undefined} className="mb-3 sm:mb-4" />
      {loading && visible.length === 0 ? (
        <ul className={grid}>
          {Array.from({ length: skeletonCount }, (_, i) => (
            <li key={i} className="flex flex-col gap-1.5">
              <Skeleton className="aspect-[4/5] w-full rounded-[1px]" />
              <span aria-hidden="true" className="font-mono text-[0.625rem] text-muted-foreground">
                {frameNumber(i)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={grid}>
          {visible.map((m, i) => {
            const day = new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeZone: "UTC" }).format(
              new Date(m.createdAt),
            );
            const alt = m.prompt
              ? m.prompt.slice(0, 140)
              : `${m.kind === "video" ? t("media.video") : t("media.openImage")}, ${day}`;
            return (
              <li key={m.id} className="flex min-w-0 flex-col gap-1.5">
                <div className="relative">
                  <Link
                    href={`/app/gallery/${m.id}`}
                    aria-label={alt}
                    className="group relative block aspect-[4/5] overflow-hidden rounded-[1px] bg-darkroom [--focus-offset:2px]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- private signed URLs must bypass the image optimizer */}
                    <img
                      src={m.thumbUrl || m.url}
                      alt=""
                      loading={i < 6 ? "eager" : "lazy"}
                      decoding="async"
                      className="size-full object-cover transition-[filter] duration-300 group-hover:brightness-105"
                    />
                    {m.kind === "video" && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex size-8 items-center justify-center rounded-full bg-black/50 text-white">
                          <PlayIcon aria-hidden="true" className="size-3.5 translate-x-px fill-current" />
                        </span>
                      </span>
                    )}
                  </Link>
                  {m.isFavorite && <GreasePencilCircle still />}
                </div>
                <div className="flex items-center justify-between gap-1 font-mono text-[0.625rem] leading-none tracking-[0.12em] text-muted-foreground uppercase">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden="true" className={cn(m.isFavorite && "text-safelight-ink")}>
                      {frameNumber(i)}
                    </span>
                    {m.kind === "video" && m.durationSec != null && <span>▶ {duration(m.durationSec)}</span>}
                    {m.isDraft && <span className="truncate">{t("media.draft")}</span>}
                  </span>
                  {onToggleFavorite && (
                    <button
                      type="button"
                      aria-pressed={m.isFavorite}
                      aria-label={t("media.favorite")}
                      onClick={() => onToggleFavorite(m, !m.isFavorite)}
                      className="relative -m-1 flex size-6 shrink-0 items-center justify-center rounded-xs text-muted-foreground transition-colors hover:text-foreground pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5"
                    >
                      <HeartIcon
                        aria-hidden="true"
                        className={cn(
                          "size-3.5",
                          m.isFavorite && "fill-current text-safelight-ink",
                        )}
                      />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
