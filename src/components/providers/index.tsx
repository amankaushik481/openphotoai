"use client";

import * as React from "react";
import dynamic from "next/dynamic";

import { ThemeProvider } from "@/components/providers/theme-provider";

// Toasts are never needed for first paint; keep sonner off the critical path (Lighthouse).
const Toaster = dynamic(() => import("@/components/ui/sonner").then((m) => m.Toaster), { ssr: false });

/**
 * Root client providers, kept minimal because they hydrate on every page (incl. the static marketing
 * pages, where JS weight is a Lighthouse cost): theme (class-based, system default) and toasts.
 *
 *   • SWR defaults live in `SwrProvider`, mounted by the layouts whose pages fetch with SWR (/app, /admin).
 *   • i18n: `useT()` falls back to DEFAULT_LOCALE, the only locale, so no provider is mounted here. Mount
 *     `I18nProvider` around a subtree once a second locale exists.
 *   • Tooltips bring their own provider (see components/ui/tooltip).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster position="top-center" richColors closeButton />
    </ThemeProvider>
  );
}
