"use client";

import { Loader2, PlayIcon } from "lucide-react";
import { useEffect, useState } from "react";

const DEMO_LOGIN_PATH = "/api/demo/login";

/** Probe answer for this page view; client-side navigations back to the page render the button at once. */
let probeAnswer: boolean | undefined;

/**
 * Client half of `DemoLoginButton` (use that one). Kept tiny because it hydrates on the landing page:
 * the probe is a plain fetch (no SWR), and the API client + toasts load only when the button is clicked.
 */
export function DemoLoginButtonClient({
  probe,
  variant,
  size,
  label,
  className,
}: {
  probe: boolean;
  variant: string;
  size: string;
  label: string;
  className: string;
}) {
  // Never true during hydration (the static HTML has no button): `probeAnswer` is only set after a probe.
  const [enabled, setEnabled] = useState(() => !probe || probeAnswer === true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!probe || probeAnswer !== undefined) return;
    let cancelled = false;
    fetch(DEMO_LOGIN_PATH)
      .then((res) => (res.ok ? (res.json() as Promise<{ enabled?: boolean }>) : null))
      .then((body) => {
        probeAnswer = body?.enabled === true;
        if (!cancelled && probeAnswer) setEnabled(true);
      })
      .catch(() => {
        // Network error: stay hidden, and probe again on the next visit.
      });
    return () => {
      cancelled = true;
    };
  }, [probe]);

  if (!enabled) return null;

  async function start() {
    setPending(true);
    try {
      const { api } = await import("@/lib/api-client");
      const { redirect } = await api<{ redirect: string }>(DEMO_LOGIN_PATH, { method: "POST" });
      // Full navigation: the new session cookie must replace whatever the client cached.
      window.location.assign(redirect);
    } catch (err) {
      setPending(false);
      try {
        const [{ apiErrorText }, { toast }] = await Promise.all([import("@/lib/api-client"), import("sonner")]);
        toast.error(apiErrorText(err));
      } catch {
        // The chunks themselves failed to load (offline): the re-enabled button is the only feedback.
      }
    }
  }

  return (
    <button
      type="button"
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={className}
      onClick={start}
      disabled={pending}
      aria-busy={pending || undefined}
      data-testid="demo-login-button"
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <PlayIcon aria-hidden />}
      {pending ? "Setting up your demo…" : label}
    </button>
  );
}
