"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlertIcon, ShieldAlertIcon, TimerIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeApiError, formatWait, type FriendlyError } from "@/components/create/logic";
import { cn } from "@/lib/utils";

export interface ApiErrorAlertProps {
  error: FriendlyError | null;
  onDismiss?: () => void;
  className?: string;
}

/** Inline, focusable error with a next step (buy credits, policy, retry countdown…). */
export function ApiErrorAlert({ error, onDismiss, className }: ApiErrorAlertProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  // Move focus to a fresh error so keyboard and screen-reader users notice it.
  React.useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);

  if (!error) return null;
  const Icon = error.code === "content_blocked" ? ShieldAlertIcon : error.code === "rate_limited" ? TimerIcon : CircleAlertIcon;
  const warn = error.code === "rate_limited" || error.code === "insufficient_credits" || error.code === "plan_limit";

  return (
    <Alert
      ref={ref}
      tabIndex={-1}
      variant={warn ? "warning" : "destructive"}
      className={cn("pr-10 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", className)}
    >
      <Icon aria-hidden="true" />
      <AlertTitle className="line-clamp-none">{error.title}</AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        {error.hint && <p className="text-xs">{error.hint}</p>}
        {error.retryAfterSec !== undefined && <RetryCountdown key={`${error.code}:${error.retryAfterSec}`} seconds={error.retryAfterSec} />}
        {error.action && (
          <Button asChild size="sm" variant={error.code === "insufficient_credits" ? "brand" : "outline"} className="mt-1">
            <Link href={error.action.href}>{error.action.label}</Link>
          </Button>
        )}
      </AlertDescription>
      {onDismiss && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="absolute top-2 right-2 size-7"
        >
          <XIcon />
        </Button>
      )}
    </Alert>
  );
}

/** "You can try again in 42 seconds", ticking down (remount via `key` for a new wait). */
function RetryCountdown({ seconds }: { seconds: number }) {
  const [deadline] = React.useState(() => Date.now() + seconds * 1000);
  const [left, setLeft] = React.useState(Math.ceil(seconds));

  React.useEffect(() => {
    const id = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(next);
      if (next === 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [deadline]);

  // Visual only: the alert's message already states the wait, and a live region would read every tick.
  return (
    <p aria-hidden="true" className="text-xs tabular-nums">
      {left > 0 ? `You can try again in ${formatWait(left)}.` : "You can try again now."}
    </p>
  );
}

/** Toast variant for secondary actions (favorite, full-quality re-render, downloads). */
export function useErrorToast() {
  const router = useRouter();
  return React.useCallback(
    (err: unknown, ctx?: Parameters<typeof describeApiError>[1]) => {
      const e = describeApiError(err, ctx);
      const action = e.action;
      toast.error(e.title, {
        description: e.message,
        ...(action ? { action: { label: action.label, onClick: () => router.push(action.href) } } : {}),
      });
    },
    [router],
  );
}
