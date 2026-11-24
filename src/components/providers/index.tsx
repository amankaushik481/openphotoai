"use client";

import * as React from "react";
import { SWRConfig } from "swr";

import { fetcher } from "@/lib/api-client";
import { I18nProvider } from "@/i18n/react";
import type { Locale } from "@/i18n";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

/** App-wide client providers: theme, i18n, SWR defaults, tooltips, toasts. */
export function Providers({ children, locale = "en" }: { children: React.ReactNode; locale?: Locale }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <I18nProvider locale={locale}>
        <SWRConfig value={{ fetcher, shouldRetryOnError: true, errorRetryCount: 3 }}>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster position="top-center" richColors closeButton />
          </TooltipProvider>
        </SWRConfig>
      </I18nProvider>
    </ThemeProvider>
  );
}
