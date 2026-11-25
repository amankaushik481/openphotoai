"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { ContactGridSkeleton } from "./contact-grid";

export interface LoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** Frame number (0-based) the next page starts at, for the placeholder frames. */
  nextFrame?: number;
}

/**
 * Infinite scroll: loads the next page when the sentinel nears the viewport. The button is the
 * fallback (no IntersectionObserver, keyboard users, or a page that doesn't fill the screen). While a
 * page loads, placeholder tiles hold its place, so the grid grows instead of jumping.
 */
export function LoadMore({ hasMore, loading, onLoadMore, nextFrame = 0 }: LoadMoreProps) {
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
      {loading && <ContactGridSkeleton row offset={nextFrame} />}
      <p className="sr-only" role="status">
        {loading ? "Loading more photos…" : ""}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={onLoadMore}
        disabled={loading}
        aria-busy={loading}
        className="font-mono text-xs tracking-[0.14em] uppercase"
      >
        {loading ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}
