"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { SWRConfig } from "swr";

import { fetcher } from "@/lib/api-client";
import { I18nProvider } from "@/i18n/react";
import type { Locale } from "@/i18n";
import { ThemeProvider } from "@/components/providers/theme-provider";

// Toasts are never needed for first paint; keep sonner off the critical path (Lighthouse).
const Toaster = dynamic(() => import("@/components/ui/sonner").then((m) => m.Toaster), { ssr: false });

/**
 * App-wide client providers: theme (class-based, system default), i18n, SWR defaults, toasts.
 * Tooltips bring their own provider (see components/ui/tooltip), so none is mounted here.
 */
export function Providers({ children, locale = "en" }: { children: React.ReactNode; locale?: Locale }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <I18nProvider locale={locale}>
        <SWRConfig value={{ fetcher, errorRetryCount: 3 }}>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </SWRConfig>
      </I18nProvider>
    </ThemeProvider>
  );
}
