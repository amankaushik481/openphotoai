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

/** The page is static, so the server always renders the unfiltered gallery; the URL is read after hydration. */
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

/**
 * Search box and category chips for the public pack gallery. The grid itself is server-rendered
 * (children with `data-slug` and `data-category` attributes); this island only hides non-matching items
 * with a scoped style rule and mirrors the choice in `?q=` / `?category=` so filtered views are linkable.
 */
export function PackCategoryFilter({
  categories,
  index,
  children,
}: {
  categories: FilterCategory[];
  /** One entry per pack in the grid. */
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

  const select = (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    setParam("category", id === ALL ? null : id);
  };
  const clearSearch = () => {
    setParam("q", null);
    inputRef.current?.focus();
  };

  const chips: FilterCategory[] = [{ id: ALL, label: "All", count: index.length }, ...categories];
  const activeLabel = chips.find((c) => c.id === active)?.label ?? "All";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div role="search" className="relative w-full sm:max-w-sm">
          <label htmlFor={searchId} className="sr-only">
            Search packs
          </label>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={inputRef}
            id={searchId}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search packs: headshot, beach, Paris…"
            value={query}
            onChange={(e) => setParam("q", e.target.value || null)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                clearSearch();
              }
            }}
            className="h-11 w-full rounded-full border bg-card pr-11 pl-10 text-base shadow-xs transition-colors outline-none placeholder:text-muted-foreground hover:border-input focus-visible:border-ring sm:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5"
            >
              <XIcon aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
        <nav aria-label="Filter packs by category">
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {chips.map((c) => {
              const current = c.id === active;
              const count = countFor(c.id);
              return (
                <li key={c.id} className="shrink-0">
                  <a
                    href={c.id === ALL ? "/packs" : `/packs?category=${c.id}`}
                    onClick={select(c.id)}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors [--focus-offset:-2px] pointer-coarse:h-11",
                      current
                        ? "border-foreground bg-foreground text-background"
                        : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c.label}
                    <span
                      className={cn(
                        "font-mono text-xs tabular-nums",
                        current ? "text-background/70" : "text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <p className="sr-only" aria-live="polite">
        {shown === 1 ? "Showing 1 pack" : `Showing ${shown} packs`}
      </p>
      {/* Category ids and slugs are validated above, so they are safe to put in CSS. */}
      {(active !== ALL || hidden.length > 0) && (
        <style>
          {[
            active !== ALL ? `[data-pack-filter="${scope}"] [data-category]:not([data-category="${active}"])` : null,
            ...hidden.map((slug) => `[data-pack-filter="${scope}"] [data-slug="${slug}"]`),
          ]
            .filter(Boolean)
            .join(",") + "{display:none}"}
        </style>
      )}
      <div data-pack-filter={scope}>{children}</div>
      {shown === 0 && matches && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
          <p className="font-medium">
            No {active === ALL ? "" : `${activeLabel.toLowerCase()} `}packs match &ldquo;{query.trim()}&rdquo;.
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Try a broader word like &ldquo;headshot&rdquo;, &ldquo;travel&rdquo; or &ldquo;dating&rdquo;
            {active === ALL ? "" : ", or search all categories"}.
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={clearSearch}
              className="inline-flex h-9 items-center rounded-full border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent pointer-coarse:h-11"
            >
              Clear search
            </button>
            {active !== ALL && (
              <button
                type="button"
                onClick={() => setParam("category", null)}
                className="inline-flex h-9 items-center rounded-full border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent pointer-coarse:h-11"
              >
                Search all categories
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
