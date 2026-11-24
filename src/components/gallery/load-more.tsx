"use client";

import * as React from "react";
import { LoaderCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface LoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

/**
 * Infinite scroll: loads the next page when the sentinel nears the viewport. The button is the
 * fallback (no IntersectionObserver, keyboard users, or a page that doesn't fill the screen).
 */
export function LoadMore({ hasMore, loading, onLoadMore }: LoadMoreProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!hasMore || loading || !el || typeof IntersectionObserver === "undefined") return;
    // Re-created after every page, so a sentinel that is still visible keeps loading.
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onLoadMore();
    }, { rootMargin: "800px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  if (!hasMore) return null;
  return (
    <div ref={ref} className="flex justify-center py-6">
      <Button type="button" variant="outline" onClick={onLoadMore} disabled={loading} aria-busy={loading}>
        {loading && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
        {loading ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}
