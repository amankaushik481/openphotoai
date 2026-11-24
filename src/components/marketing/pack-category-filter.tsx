"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const CHANGE_EVENT = "packs:category-change";
const ALL = "all";

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

/** The page is static, so the server always renders "all"; the URL is read after hydration. */
function serverCategory(): string {
  return ALL;
}

export interface FilterCategory {
  id: string;
  label: string;
  count: number;
}

/**
 * Category chips for the public pack gallery. The grid itself is server-rendered (children with
 * `data-category` attributes); this island only hides non-matching items with a scoped style rule
 * and mirrors the choice in `?category=` so filtered views are linkable.
 */
export function PackCategoryFilter({
  categories,
  total,
  children,
}: {
  categories: FilterCategory[];
  total: number;
  children: React.ReactNode;
}) {
  const scope = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const requested = React.useSyncExternalStore(subscribe, readCategory, serverCategory);
  const active = categories.some((c) => c.id === requested) ? requested : ALL;
  const shown = active === ALL ? total : (categories.find((c) => c.id === active)?.count ?? total);

  const select = (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const url = new URL(window.location.href);
    if (id === ALL) url.searchParams.delete("category");
    else url.searchParams.set("category", id);
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  const chips: FilterCategory[] = [{ id: ALL, label: "All", count: total }, ...categories];

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Filter packs by category">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {chips.map((c) => {
            const current = c.id === active;
            return (
              <li key={c.id} className="shrink-0">
                <a
                  href={c.id === ALL ? "/packs" : `/packs?category=${c.id}`}
                  onClick={select(c.id)}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
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
                    {c.count}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <p className="sr-only" aria-live="polite">
        Showing {shown} packs
      </p>
      {/* `active` is validated against the known category ids above, so it is safe to put in CSS. */}
      {active !== ALL && (
        <style>{`[data-pack-filter="${scope}"] [data-category]:not([data-category="${active}"]){display:none}`}</style>
      )}
      <div data-pack-filter={scope}>{children}</div>
    </div>
  );
}
