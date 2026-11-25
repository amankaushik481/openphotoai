"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/** At most this many refreshes per page view (a file that is really gone must not loop). */
const MAX_REFRESHES = 2;
const MIN_GAP_MS = 30_000;

/**
 * Pages that render media from server props (editor, video, try-on) keep their signed URLs for as long
 * as the tab stays open. URLs last at least an hour; an image that fails to load after that (a lazy
 * one, a tab switch, the brush canvas opened late) re-renders the page data once to get fresh URLs.
 * Error events don't bubble, so they are caught in the capture phase on `ref`.
 */
export function useExpiredMediaRefresh(ref: React.RefObject<HTMLElement | null>) {
  const router = useRouter();
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let count = 0;
    let last = -Infinity;
    const onError = (e: Event) => {
      const target = e.target;
      if (!(target instanceof HTMLImageElement || target instanceof HTMLVideoElement)) return;
      const now = performance.now();
      if (count >= MAX_REFRESHES || now - last < MIN_GAP_MS) return;
      count++;
      last = now;
      router.refresh();
    };
    el.addEventListener("error", onError, true);
    return () => el.removeEventListener("error", onError, true);
  }, [ref, router]);
}
