"use client";

import * as React from "react";

/**
 * Loads posthog-js lazily (separate chunk, after hydration) and only when a key is configured.
 * Rendered by the root layout only when NEXT_PUBLIC_POSTHOG_KEY is set, so self-hosters without
 * analytics ship zero analytics code.
 */
export function PostHogProvider({ apiKey, apiHost }: { apiKey: string; apiHost: string }) {
  React.useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    const load = () => {
      void import("posthog-js").then(({ default: posthog }) => {
        if (cancelled || posthog.__loaded) return;
        posthog.init(apiKey, {
          api_host: apiHost,
          capture_pageview: "history_change",
          person_profiles: "identified_only",
          respect_dnt: true,
          // No session replay by default: prompts and photos may be personal.
          disable_session_recording: true,
        });
      });
    };
    // Defer to idle time so analytics never competes with first paint / interaction.
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const handle = w.requestIdleCallback ? w.requestIdleCallback(load) : window.setTimeout(load, 1500);
    return () => {
      cancelled = true;
      if (!w.requestIdleCallback) window.clearTimeout(handle);
    };
  }, [apiKey, apiHost]);

  return null;
}
