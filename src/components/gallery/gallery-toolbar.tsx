"use client";

import * as React from "react";
import Link from "next/link";
import { FolderIcon, SquareDashedIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useModels } from "@/hooks/use-models";
import { viewOf, withView, type GalleryFilters, type GalleryView } from "./gallery-filters";
import { MiniContactSheet } from "./marks";

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

const VIEWS: { value: GalleryView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "favorites", label: "Favorites" },
  { value: "photos", label: "Photos" },
  { value: "videos", label: "Videos" },
];

/** Mono tab: a safelight underline marks the one that's on. */
const TAB =
  "h-10 flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase shadow-none first:rounded-none last:rounded-none hover:bg-transparent hover:text-foreground data-[state=on]:border-safelight-ink data-[state=on]:bg-transparent data-[state=on]:text-foreground pointer-coarse:h-11";

/** Filter selects: flat, mono, on the hairline. */
const FILTER =
  "h-8 max-w-44 rounded-sm border-foreground/20 bg-transparent font-mono text-xs tracking-[0.08em] uppercase shadow-none dark:bg-transparent";

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-foreground/15 sm:border-b">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && onFiltersChange(withView(filters, v as GalleryView))}
          aria-label="Show"
          className="-mb-px gap-5 border-foreground/15 max-sm:w-full max-sm:border-b sm:gap-7"
        >
          {VIEWS.map((v) => (
            <ToggleGroupItem key={v.value} value={v.value} className={TAB}>
              {v.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="mb-2 flex flex-wrap items-center gap-2 max-sm:w-full">
        <Select
          value={filters.modelId ?? ALL}
          onValueChange={(v) => onFiltersChange({ ...filters, modelId: v === ALL ? undefined : v })}
        >
          <SelectTrigger size="sm" aria-label="Filter by model" className={FILTER}>
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
          <SelectTrigger size="sm" aria-label="Filter by pack" className={FILTER}>
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
          <span className="inline-flex h-8 items-center gap-1 rounded-sm border border-safelight-ink/50 pr-1 pl-2.5 font-mono text-xs tracking-[0.08em] uppercase">
            <Link href={`/app/batches/${filters.batchId}`} className="underline underline-offset-4">
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

        </div>

        <div className="mb-2 ml-auto flex items-center gap-2">
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
            className={selecting ? "border border-safelight-ink text-safelight-ink" : undefined}
          >
            <SquareDashedIcon aria-hidden="true" />
            {selecting ? "Done" : "Select"}
          </Button>
        </div>
      </div>

      {(hiddenCount > 0 || filters.showHidden) && (
        <section
          aria-labelledby={`${hiddenSwitchId}-title`}
          className="grid gap-4 border border-foreground/15 bg-card p-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:p-4"
        >
          <MiniContactSheet className="w-36 max-sm:hidden" />
          <div className="flex flex-col gap-1.5">
            <p className="mono-caps text-safelight-ink">
              {filters.showHidden ? "Contact sheet · every frame" : "Contact sheet · keepers circled"}
            </p>
            <h2 id={`${hiddenSwitchId}-title`} className="font-display text-2xl leading-none tracking-tight">
              {filters.showHidden ? "Showing every result" : "Best shots only"}
            </h2>
            <p className="max-w-[62ch] text-muted-foreground">
              {filters.showHidden
                ? "Weaker results (lower likeness or quality) are marked Hidden. Unhide the ones you like."
                : hiddenCount === 1
                  ? "Our best-shots picker hid 1 weaker result (lower likeness or quality). It's still yours to view, download or delete."
                  : `Our best-shots picker hid ${hiddenCount.toLocaleString()} weaker results (lower likeness or quality). They're still yours to view, download or delete.`}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-3 justify-self-start sm:justify-self-end">
            <Label htmlFor={hiddenSwitchId} className="font-mono text-xs tracking-[0.1em] whitespace-nowrap uppercase">
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
