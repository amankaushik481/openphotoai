"use client";

import { usePathname } from "next/navigation";
import * as React from "react";
import { isSensitivePath, sanitizeUrl, scrubAnalyticsEvent } from "@/lib/analytics-url";

type PostHogClient = (typeof import("posthog-js/dist/module.slim"))["default"];

/** First interaction loads analytics right away; otherwise it waits until well after `load`. */
const INTERACTION_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
const AFTER_LOAD_DELAY_MS = 3000;
const IDLE_TIMEOUT_MS = 2000;

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * PostHog, privacy- and performance-scoped. Rendered by the root layout only when
 * NEXT_PUBLIC_POSTHOG_KEY is set, so self-hosters without analytics ship zero analytics code.
 *
 *   • Slim bundle (no autocapture, replay, surveys, flags, toolbar), loaded as a separate chunk on
 *     the first interaction or a few seconds after `load` — never during first paint / Lighthouse.
 *   • Never initialised on token-bearing routes (/verify, /s/…, /invites/…, /account/delete…).
 *   • Pageviews are sent manually with a scrubbed URL, and `before_send` scrubs every URL property
 *     (see src/lib/analytics-url.ts), so magic-link, share and invite tokens never leave the browser.
 */
export function PostHogProvider({ apiKey, apiHost }: { apiKey: string; apiHost: string }) {
  const pathname = usePathname();
  const sensitive = isSensitivePath(pathname ?? "/");
  const [client, setClient] = React.useState<PostHogClient | null>(null);

  React.useEffect(() => {
    if (!apiKey || client || sensitive) return;
    let cancelled = false;
    let started = false;
    let timer: number | undefined;
    let idle: number | undefined;
    const w = window as IdleWindow;

    const clearTriggers = () => {
      for (const name of INTERACTION_EVENTS) window.removeEventListener(name, start);
      window.removeEventListener("load", afterLoad);
      if (timer !== undefined) window.clearTimeout(timer);
      if (idle !== undefined) w.cancelIdleCallback?.(idle);
    };
    function start() {
      if (started) return;
      started = true;
      clearTriggers();
      void import("posthog-js/dist/module.slim").then(({ default: posthog }) => {
        if (cancelled) return;
        if (!posthog.__loaded) {
          posthog.init(apiKey, {
            api_host: apiHost,
            capture_pageview: false,
            capture_pageleave: false,
            autocapture: false,
            person_profiles: "identified_only",
            respect_dnt: true,
            // No session replay / remote code: prompts and photos may be personal.
            disable_session_recording: true,
            disable_surveys: true,
            disable_external_dependency_loading: true,
            advanced_disable_flags: true,
            before_send: (event) => (event ? scrubAnalyticsEvent(event) : event),
          });
        }
        setClient(posthog);
      });
    }
    function afterLoad() {
      timer = window.setTimeout(() => {
        if (w.requestIdleCallback) idle = w.requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS });
        else start();
      }, AFTER_LOAD_DELAY_MS);
    }

    for (const name of INTERACTION_EVENTS) window.addEventListener(name, start, { once: true, passive: true });
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });
    return () => {
      cancelled = true;
      clearTriggers();
    };
  }, [apiKey, apiHost, client, sensitive]);

  // Manual pageviews (initial + client-side navigations) with the scrubbed URL.
  React.useEffect(() => {
    if (!client) return;
    const url = sanitizeUrl(window.location.href);
    if (url) client.capture("$pageview", { $current_url: url });
  }, [client, pathname]);

  return null;
}
