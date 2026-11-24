"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronsUpDownIcon, LayersIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { packGradient } from "@/components/app/pack-card";
import { PACK_CATEGORY_LABELS, filterPacks, type PackDetail } from "@/components/create/logic";
import { fetcher } from "@/lib/api-client";
import type { PackSummary } from "@/types/pack";
import { cn } from "@/lib/utils";

/** Gradient tile with the pack's emoji (packs rarely have cover images). */
export function PackSwatch({ pack, className }: { pack: Pick<PackSummary, "colors" | "emoji">; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-xl shadow-xs", className)}
      style={{ backgroundImage: packGradient(pack.colors) }}
    >
      {pack.emoji ?? "📸"}
    </span>
  );
}

export interface PackQuickPickerProps {
  packs: readonly PackSummary[];
  value: string | null;
  onValueChange: (slug: string) => void;
  className?: string;
}

/** Searchable pack combobox in a popover (type to filter, arrows to move, Enter to pick). */
export function PackQuickPicker({ packs, value, onValueChange, className }: PackQuickPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const labelId = React.useId();
  const listId = React.useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const selected = packs.find((p) => p.slug === value);
  const results = React.useMemo(() => filterPacks(packs, { query }), [packs, query]);
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  React.useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-opt-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, listId]);

  function pick(pack: PackSummary) {
    onValueChange(pack.slug);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + delta + results.length) % results.length);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : Math.max(0, results.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pack = results[activeIndex];
      if (pack) pick(pack);
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label id={labelId}>Photo pack</Label>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setActive(Math.max(0, results.findIndex((p) => p.slug === value)));
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-labelledby={labelId}
            aria-describedby={`${labelId}-value`}
            className="h-auto w-full justify-start gap-3 px-3 py-2 text-left"
          >
            {selected ? (
              <PackSwatch pack={selected} className="size-9 text-lg" />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <LayersIcon aria-hidden="true" className="text-muted-foreground" />
              </span>
            )}
            <span id={`${labelId}-value`} className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{selected?.name ?? "Choose a pack"}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {selected ? selected.tagline : `${packs.length} packs: headshots, dating, travel…`}
              </span>
            </span>
            <ChevronsUpDownIcon aria-hidden="true" className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-0">
          <div className="flex items-center gap-2 border-b px-3">
            <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <input
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
              aria-label="Search packs"
              placeholder="Search packs…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="h-11 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Packs" className="max-h-80 overflow-y-auto p-1">
            {results.map((p, i) => (
              <li
                key={p.slug}
                id={optionId(i)}
                role="option"
                aria-selected={p.slug === value}
                data-active={i === activeIndex || undefined}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => i !== activeIndex && setActive(i)}
                onClick={() => pick(p)}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 data-[active]:bg-accent aria-selected:font-medium"
              >
                <PackSwatch pack={p} className="size-8 text-base" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{p.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {PACK_CATEGORY_LABELS[p.category]} · {p.promptCount} styles
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {results.length === 0 && <p className="px-3 pb-4 text-sm text-muted-foreground">No packs match “{query}”.</p>}
          <div className="border-t p-1">
            <Button asChild variant="ghost" size="sm" className="w-full justify-start">
              <Link href="/app/packs">Browse all packs</Link>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const ANY_SHOT = "any";

/** Optional: pick one specific shot of the pack (titles from GET /api/packs/:slug). */
export function PackShotSelect({
  slug,
  value,
  onValueChange,
}: {
  slug: string;
  value: number | null;
  onValueChange: (index: number | null) => void;
}) {
  const id = React.useId();
  const { data, error, isLoading } = useSWR<{ pack: PackDetail }>(`/api/packs/${encodeURIComponent(slug)}`, fetcher, {
    revalidateOnFocus: false,
  });
  const prompts = data?.pack.prompts ?? [];

  if (error) return null;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Shot</Label>
      {isLoading && !data ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <Select
          value={value === null ? ANY_SHOT : String(value)}
          onValueChange={(v) => onValueChange(v === ANY_SHOT ? null : Number(v))}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_SHOT}>Surprise me (a random shot each time)</SelectItem>
            {prompts.map((p, i) => (
              <SelectItem key={i} value={String(i)}>
                {p.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
