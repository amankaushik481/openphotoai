"use client";

import * as React from "react";

/**
 * Publish a fixed bottom bar's real height (incl. safe-area padding) as a CSS variable on <html>, so
 * stacked bars, page padding and `scroll-padding-bottom` follow it when text scaling or zoom grows the
 * bar. globals.css holds rem-based fallbacks for the first paint; a hidden bar reports 0px.
 */
export function useBottomChromeHeight(
  ref: React.RefObject<HTMLElement | null>,
  variable: "--bottom-nav-h" | "--bottom-action-h",
): void {
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(variable, `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(variable);
    };
  }, [ref, variable]);
}
