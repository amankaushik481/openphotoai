import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

import { Providers } from "@/components/providers";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { APP } from "@/config/app";
import { DEFAULT_LOCALE } from "@/i18n";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
// Only used in code snippets; don't compete with the UI font for preload bandwidth.
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap", preload: false });
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  // "optional": the hero headline is the LCP element; never swap fonts late (keeps LCP + CLS stable).
  display: "optional",
});

const defaultTitle = `${APP.name} — ${APP.tagline}`;

export const metadata: Metadata = {
  metadataBase: new URL(APP.url),
  title: { default: defaultTitle, template: `%s · ${APP.name}` },
  description: APP.description,
  applicationName: APP.name,
  keywords: ["AI photographer", "AI headshots", "AI photos", "open source", "self-hosted", "LinkedIn headshots"],
  openGraph: {
    type: "website",
    siteName: APP.name,
    title: defaultTitle,
    description: APP.description,
    url: "/",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: defaultTitle, description: APP.description },
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { title: APP.name, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0a08" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang={DEFAULT_LOCALE}
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} ${display.variable}`}
    >
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <Providers locale={DEFAULT_LOCALE}>{children}</Providers>
        {APP.posthogKey ? <PostHogProvider apiKey={APP.posthogKey} apiHost={APP.posthogHost} /> : null}
      </body>
    </html>
  );
}
