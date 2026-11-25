"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckSquareIcon,
  FolderIcon,
  HeartIcon,
  ImageIcon,
  ImagesIcon,
  SparklesIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useModels } from "@/hooks/use-models";
import { viewOf, withView, type GalleryFilters, type GalleryView } from "./gallery-filters";

export interface PackOption {
  slug: string;
  name: string;
}

export interface GalleryToolbarProps {
  filters: GalleryFilters;
  onFiltersChange: (next: GalleryFilters) => void;
  packs: readonly PackOption[];
  folderName?: string | null;
  hiddenCount: number;
  selecting: boolean;
  onSelectingChange: (on: boolean) => void;
  onOpenFolders: () => void;
  /** The "Select" toggle: focus returns here when selection mode ends from elsewhere. */
  selectToggleRef?: React.Ref<HTMLButtonElement>;
}

const ALL = "all";

export function GalleryToolbar({
  filters,
  onFiltersChange,
  packs,
  folderName,
  hiddenCount,
  selecting,
  onSelectingChange,
  onOpenFolders,
  selectToggleRef,
}: GalleryToolbarProps) {
  const { models } = useModels();
  const hiddenSwitchId = React.useId();
  const view = viewOf(filters);
  const packKnown = !filters.packId || packs.some((p) => p.slug === filters.packId);
  const modelKnown = !filters.modelId || models?.some((m) => m.id === filters.modelId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          onValueChange={(v) => v && onFiltersChange(withView(filters, v as GalleryView))}
          aria-label="Show"
        >
          <ToggleGroupItem value="all" className="px-3">
            <ImagesIcon aria-hidden="true" className="max-sm:hidden" />
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="favorites" className="px-3">
            <HeartIcon aria-hidden="true" className="max-sm:hidden" />
            Favorites
          </ToggleGroupItem>
          <ToggleGroupItem value="photos" className="px-3">
            <ImageIcon aria-hidden="true" className="max-sm:hidden" />
            Photos
          </ToggleGroupItem>
          <ToggleGroupItem value="videos" className="px-3">
            <VideoIcon aria-hidden="true" className="max-sm:hidden" />
            Videos
          </ToggleGroupItem>
        </ToggleGroup>

        <Select
          value={filters.modelId ?? ALL}
          onValueChange={(v) => onFiltersChange({ ...filters, modelId: v === ALL ? undefined : v })}
        >
          <SelectTrigger size="sm" aria-label="Filter by model" className="max-w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All models</SelectItem>
            {models?.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
            {!modelKnown && filters.modelId && <SelectItem value={filters.modelId}>Selected model</SelectItem>}
          </SelectContent>
        </Select>

        <Select
          value={filters.packId ?? ALL}
          onValueChange={(v) => onFiltersChange({ ...filters, packId: v === ALL ? undefined : v })}
        >
          <SelectTrigger size="sm" aria-label="Filter by pack" className="max-w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All packs</SelectItem>
            {packs.map((p) => (
              <SelectItem key={p.slug} value={p.slug}>
                {p.name}
              </SelectItem>
            ))}
            {!packKnown && filters.packId && <SelectItem value={filters.packId}>{filters.packId}</SelectItem>}
          </SelectContent>
        </Select>

        {filters.batchId && (
          <span className="inline-flex h-8 items-center gap-1 rounded-md border bg-card pr-1 pl-3 text-sm">
            <Link href={`/app/batches/${filters.batchId}`} className="underline-offset-4 hover:underline">
              One batch
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-6"
              aria-label="Clear batch filter"
              onClick={() => onFiltersChange({ ...filters, batchId: undefined })}
            >
              <XIcon />
            </Button>
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="lg:hidden" onClick={onOpenFolders}>
            <FolderIcon aria-hidden="true" />
            <span className="max-w-28 truncate">{folderName ?? "Folders"}</span>
          </Button>
          <Button
            ref={selectToggleRef}
            type="button"
            variant={selecting ? "secondary" : "outline"}
            size="sm"
            aria-pressed={selecting}
            onClick={() => onSelectingChange(!selecting)}
          >
            <CheckSquareIcon aria-hidden="true" />
            {selecting ? "Done" : "Select"}
          </Button>
        </div>
      </div>

      {(hiddenCount > 0 || filters.showHidden) && (
        <section
          aria-labelledby={`${hiddenSwitchId}-title`}
          className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-brand-soft/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-4"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white shadow-sm"
            >
              <SparklesIcon className="size-4" />
            </span>
            <div className="flex flex-col gap-0.5">
              <h2 id={`${hiddenSwitchId}-title`} className="font-medium">
                {filters.showHidden ? "Showing every result" : "Best shots only"}
              </h2>
              <p className="text-muted-foreground">
                {filters.showHidden
                  ? "Weaker results (lower likeness or quality) are marked Hidden. Unhide the ones you like."
                  : hiddenCount === 1
                    ? "Our best-shots picker hid 1 weaker result (lower likeness or quality). It's still yours to view, download or delete."
                    : `Our best-shots picker hid ${hiddenCount.toLocaleString()} weaker results (lower likeness or quality). They're still yours to view, download or delete.`}
              </p>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
            <Label htmlFor={hiddenSwitchId} className="whitespace-nowrap">
              Show hidden ({hiddenCount.toLocaleString()})
            </Label>
            <Switch
              id={hiddenSwitchId}
              checked={Boolean(filters.showHidden)}
              onCheckedChange={(on) => onFiltersChange({ ...filters, showHidden: on || undefined })}
            />
          </span>
        </section>
      )}
    </div>
  );
}
