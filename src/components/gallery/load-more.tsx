"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export interface LoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

/**
 * Infinite scroll: loads the next page when the sentinel nears the viewport. The button is the
 * fallback (no IntersectionObserver, keyboard users, or a page that doesn't fill the screen). While a
 * page loads, placeholder tiles hold its place, so the grid grows instead of jumping.
 */
export function LoadMore({ hasMore, loading, onLoadMore }: LoadMoreProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!hasMore || loading || !el || typeof IntersectionObserver === "undefined") return;
    // Re-created after every page, so a sentinel that is still visible keeps loading.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  if (!hasMore) return null;
  return (
    <div ref={ref} className="@container flex flex-col items-center gap-4 py-2">
      {loading && (
        <ul
          aria-hidden="true"
          className="grid w-full grid-cols-2 gap-2 sm:gap-3 @md:grid-cols-3 @3xl:grid-cols-4 @6xl:grid-cols-5"
        >
          {/* One row at every column count (2 / 3 / 4 / 5). */}
          {[undefined, undefined, "hidden @md:block", "hidden @3xl:block", "hidden @6xl:block"].map((cls, i) => (
            <li key={i} className={cls}>
              <Skeleton className="aspect-[4/5] w-full rounded-lg" />
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" role="status">
        {loading ? "Loading more photos…" : ""}
      </p>
      <Button type="button" variant="outline" onClick={onLoadMore} disabled={loading} aria-busy={loading}>
        {loading ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}
