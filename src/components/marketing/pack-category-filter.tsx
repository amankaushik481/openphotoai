"use client";

import * as React from "react";
import { SearchIcon, XIcon } from "lucide-react";

import { searchPacks, type PackSearchEntry } from "@/content/packs";
import { cn } from "@/lib/utils";

const CHANGE_EVENT = "packs:filter-change";
const ALL = "all";
/** Slugs are validated server-side by the pack schema; re-check before putting one in CSS. */
const SAFE_SLUG = /^[a-z0-9-]+$/;

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readCategory(): string {
  return new URLSearchParams(window.location.search).get("category") ?? ALL;
}

function readQuery(): string {
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

/** The page is static, so the server always renders the unfiltered index; the URL is read after hydration. */
const serverCategory = () => ALL;
const serverQuery = () => "";

/** Mirror the filters in the URL (linkable, survives reload and back) without a navigation. */
function setParam(name: "category" | "q", value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export interface FilterCategory {
  id: string;
  label: string;
  count: number;
}

const quietButton =
  "inline-flex h-10 items-center rounded-[3px] border border-foreground/40 px-4 text-sm font-medium transition-colors hover:border-foreground hover:bg-accent pointer-coarse:h-11";

/**
 * Search box and category index for the public pack index. The list itself is server-rendered (items with
 * `data-slug` and `data-category`, optional category groups with `data-group`); this island only hides
 * what doesn't match with a scoped style rule and mirrors the choice in `?q=` / `?category=` so filtered
 * views are linkable. Wide screens get the controls in the left margin, sticky beside the list.
 */
export function PackCategoryFilter({
  categories,
  index,
  children,
}: {
  categories: FilterCategory[];
  /** One entry per pack in the list. */
  index: PackSearchEntry[];
  children: React.ReactNode;
}) {
  const scope = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const searchId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const requested = React.useSyncExternalStore(subscribe, readCategory, serverCategory);
  const query = React.useSyncExternalStore(subscribe, readQuery, serverQuery);
  const active = categories.some((c) => c.id === requested) ? requested : ALL;

  const matches = React.useMemo(() => searchPacks(index, query), [index, query]);
  const inSearch = (e: PackSearchEntry) => !matches || matches.has(e.slug);
  const countFor = (id: string) => index.filter((e) => (id === ALL || e.category === id) && inSearch(e)).length;
  const shown = countFor(active);
  const hidden = index.filter((e) => !inSearch(e) && SAFE_SLUG.test(e.slug)).map((e) => e.slug);
  // Category groups with nothing left to show (other categories, or no search matches) are hidden too.
  const hiddenGroups = categories
    .filter((c) => SAFE_SLUG.test(c.id) && ((active !== ALL && c.id !== active) || countFor(c.id) === 0))
    .map((c) => c.id);

  const select = (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    setParam("category", id === ALL ? null : id);
  };
  const clearSearch = () => {
    setParam("q", null);
    inputRef.current?.focus();
  };

  const chips: FilterCategory[] = [{ id: ALL, label: "All packs", count: index.length }, ...categories];
  const activeLabel = chips.find((c) => c.id === active)?.label ?? "All";

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
      <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-24 lg:col-span-3 lg:self-start">
        <div role="search" className="relative w-full">
          <label htmlFor={searchId} className="mono-caps mb-1 block text-muted-foreground">
            Search packs
          </label>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3.5 left-0 size-4 text-muted-foreground"
          />
          <input
            ref={inputRef}
            id={searchId}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Headshot, beach, Paris…"
            value={query}
            onChange={(e) => setParam("q", e.target.value || null)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                clearSearch();
              }
            }}
            className="h-11 w-full rounded-none border-0 border-b border-foreground bg-transparent pr-10 pl-6 text-base transition-colors [--focus-offset:3px] placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-0 bottom-1.5 inline-flex size-8 items-center justify-center rounded-[3px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5"
            >
              <XIcon aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
        <nav aria-label="Filter packs by category">
          <p className="mono-caps hidden pb-2 text-muted-foreground lg:block">Sections</p>
          <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:-mx-8 sm:px-8 lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-t lg:border-border lg:px-0 lg:pb-0">
            {chips.map((c) => {
              const current = c.id === active;
              const count = countFor(c.id);
              return (
                <li key={c.id} className="shrink-0 lg:border-b lg:border-border">
                  <a
                    href={c.id === ALL ? "/packs" : `/packs?category=${c.id}`}
                    onClick={select(c.id)}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "flex h-11 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors [--focus-offset:-2px] lg:h-auto lg:justify-between lg:border-b-0 lg:px-0 lg:py-1.5",
                      current
                        ? "border-safelight-ink font-medium text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "hidden size-1.5 rounded-full lg:inline-block",
                          current ? "bg-safelight-ink" : "bg-transparent",
                        )}
                      />
                      {c.label}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{count}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="min-w-0 lg:col-span-9">
        <p className="sr-only" aria-live="polite">
          {shown === 1 ? "Showing 1 pack" : `Showing ${shown} packs`}
        </p>
        {/* Category ids and slugs are validated above, so they are safe to put in CSS. */}
        {(active !== ALL || hidden.length > 0 || hiddenGroups.length > 0) && (
          <style>
            {[
              active !== ALL ? `[data-pack-filter="${scope}"] [data-category]:not([data-category="${active}"])` : null,
              ...hidden.map((slug) => `[data-pack-filter="${scope}"] [data-slug="${slug}"]`),
              ...hiddenGroups.map((id) => `[data-pack-filter="${scope}"] [data-group="${id}"]`),
            ]
              .filter(Boolean)
              .join(",") + "{display:none}"}
          </style>
        )}
        <div data-pack-filter={scope}>{children}</div>
        {shown === 0 && matches && (
          <div className="border-y border-foreground py-12">
            {/* An empty roll: unexposed frames. */}
            <div aria-hidden="true" className="flex gap-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="aspect-[4/5] w-16 border border-dashed border-foreground/40 sm:w-20" />
              ))}
            </div>
            <p className="mono-caps mt-6 text-muted-foreground">Nothing on this roll</p>
            <p className="mt-2 font-display text-3xl leading-tight">
              No {active === ALL ? "" : `${activeLabel.toLowerCase()} `}packs match &ldquo;{query.trim()}&rdquo;.
            </p>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Try a broader word like &ldquo;headshot&rdquo;, &ldquo;travel&rdquo; or &ldquo;dating&rdquo;
              {active === ALL ? "" : ", or search all categories"}.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" onClick={clearSearch} className={quietButton}>
                Clear search
              </button>
              {active !== ALL && (
                <button type="button" onClick={() => setParam("category", null)} className={quietButton}>
                  Search all categories
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
