"use client";

import * as React from "react";
import { LayersIcon, SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/app/empty-state";
import { PackCard } from "@/components/app/pack-card";
import { PACK_CATEGORY_LABELS, filterPacks, isPackCategory, packCategoriesIn, plural } from "@/components/create/logic";
import type { PackCategory, PackSummary } from "@/types/pack";

export interface PackBrowserProps {
  packs: PackSummary[];
  initialQuery?: string;
  initialCategory?: string;
}

/** In-app pack gallery: search + category filter (kept in the URL so it survives reloads / back). */
export function PackBrowser({ packs, initialQuery = "", initialCategory }: PackBrowserProps) {
  const searchId = React.useId();
  const [query, setQuery] = React.useState(initialQuery);
  const [category, setCategory] = React.useState<PackCategory | "all">(
    isPackCategory(initialCategory) ? initialCategory : "all",
  );
  const categories = React.useMemo(() => packCategoriesIn(packs), [packs]);
  const deferredQuery = React.useDeferredValue(query);
  const results = React.useMemo(
    () => filterPacks(packs, { query: deferredQuery, category }),
    [packs, deferredQuery, category],
  );

  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (deferredQuery.trim()) url.searchParams.set("q", deferredQuery.trim());
    else url.searchParams.delete("q");
    if (category !== "all") url.searchParams.set("category", category);
    else url.searchParams.delete("category");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [deferredQuery, category]);

  const reset = () => {
    setQuery("");
    setCategory("all");
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="relative max-w-md">
          <label htmlFor={searchId} className="sr-only">
            Search packs
          </label>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search packs — “linkedin”, “paris”, “dating”…"
            className="h-11 pr-9 pl-9"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 size-8 -translate-y-1/2"
            >
              <XIcon />
            </Button>
          )}
        </div>
        <ToggleGroup
          type="single"
          value={category}
          onValueChange={(v) => setCategory(v ? (v as PackCategory | "all") : "all")}
          aria-label="Category"
          className="-mx-4 flex w-auto max-w-none flex-nowrap gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {(["all", ...categories] as const).map((c) => (
            <ToggleGroupItem
              key={c}
              value={c}
              className="h-8 flex-none rounded-full border px-3 first:rounded-full last:rounded-full data-[state=on]:border-primary data-[state=on]:bg-brand-soft data-[state=on]:text-brand-soft-foreground"
            >
              {c === "all" ? "All" : PACK_CATEGORY_LABELS[c]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {results.length === packs.length
          ? `${packs.length} packs`
          : `${results.length} ${plural(results.length, "pack")} of ${packs.length}`}
      </p>

      {results.length === 0 ? (
        <EmptyState
          icon={<LayersIcon />}
          title="No packs match"
          description="Try another word or category — or write your own prompt on the Create page."
          action={
            <Button type="button" variant="outline" onClick={reset}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((pack, i) => (
            <li key={pack.slug}>
              <PackCard pack={pack} href={`/app/packs/${pack.slug}`} priority={i < 4} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
