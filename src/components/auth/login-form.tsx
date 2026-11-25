"use client";

import { ArrowLeft, ExternalLink, Inbox, Loader2, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP } from "@/config/app";
import { focusOnMount } from "@/lib/a11y";
import { signIn } from "@/lib/auth-client";
import { resendSecondsLeft, sendErrorMessage, suggestEmail, webmailFor, type SendError } from "./email-hints";
import { GoogleIcon } from "./google-icon";
import { SheetKicker, SheetTitle } from "./sheet-heading";

interface LoginFormProps {
  /** Same-origin path to land on after sign-in (already sanitized by the server). */
  callbackURL: string;
  /** Where auth errors are reported (`/login?next=...`). */
  errorCallbackURL: string;
  googleEnabled: boolean;
  /** Mock email mode: links go to the dev mailbox instead of a real inbox. */
  devMailbox: boolean;
  initialError?: string | null;
}

type Status = "idle" | "sending" | "sent";

/**
 * Ticks once a second while `active`, so the resend countdown re-renders. The first reading can be
 * stale; `resendSecondsLeft` clamps to the cooldown, so that only delays the first tick.
 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function LoginForm({ callbackURL, errorCallbackURL, googleEnabled, devMailbox, initialError }: LoginFormProps) {
  const emailId = useId();
  const errorId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  /** The address the last link went to (the input may be edited afterwards). */
  const [sentTo, setSentTo] = useState("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [resending, setResending] = useState(false);
  const [touched, setTouched] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [announcement, setAnnouncement] = useState("");

  const now = useNow(status === "sent" && sentAt !== null);
  const cooldown = resendSecondsLeft(sentAt, now);
  const resendBlocked = resending || cooldown > 0;
  const suggestion = touched ? suggestEmail(email) : null;
  const sentSuggestion = status === "sent" ? suggestEmail(sentTo) : null;
  const webmail = devMailbox ? null : webmailFor(sentTo);

  // Back from Google via the back button: the page comes out of the bfcache with the spinner still on.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setGooglePending(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  /** Sends a link to `to`. Returns false (and shows why) when it couldn't. */
  async function sendLink(to: string): Promise<boolean> {
    setError(null);
    let err: SendError | null = null;
    try {
      ({ error: err } = await signIn.magicLink({ email: to, callbackURL, errorCallbackURL }));
    } catch {
      err = { status: 0 };
    }
    if (err) {
      setError(sendErrorMessage(err));
      return false;
    }
    setSentTo(to);
    setSentAt(Date.now());
    return true;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setStatus((await sendLink(email.trim())) ? "sent" : "idle");
  }

  /** Resend (or send to the corrected address) without leaving the "check your inbox" view. */
  async function onResend(to = sentTo) {
    if (resending || (to === sentTo && cooldown > 0)) return;
    setResending(true);
    setAnnouncement("");
    const ok = await sendLink(to);
    setResending(false);
    if (ok) {
      setEmail(to);
      const message = `A new sign-in link is on its way to ${to}.`;
      setAnnouncement(message);
      toast.success(message);
    }
  }

  async function onGoogle() {
    setError(null);
    setGooglePending(true);
    let err: SendError | null = null;
    try {
      ({ error: err } = await signIn.social({ provider: "google", callbackURL, errorCallbackURL }));
    } catch {
      err = { status: 0 };
    }
    // On success the browser is already navigating to Google.
    if (err) {
      setGooglePending(false);
      setError(
        err.status === 0
          ? "We couldn't reach the server. Check your connection and try again."
          : "Google sign-in isn't available right now. Use the email link instead.",
      );
    }
  }

  function editEmail() {
    setStatus("idle");
    setError(null);
    setAnnouncement("");
    setTouched(false);
  }

  if (status === "sent") {
    return (
      <div>
        <SheetKicker tone="safelight">Link sent · single use</SheetKicker>
        {/* The form (and its focused button) was replaced: focus the new title so it's announced. */}
        <SheetTitle tabIndex={-1} ref={focusOnMount} className="focus:outline-hidden">
          Check your inbox
        </SheetTitle>
        <p className="mt-3 text-sm text-muted-foreground">
          We sent a sign-in link to <span className="font-medium break-all text-foreground">{sentTo}</span>. It works
          once and expires in 15 minutes.
        </p>
        <div className="mt-6 grid gap-3">
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
          {sentSuggestion && (
            <Alert variant="warning">
              <AlertDescription className="grid gap-2">
                <p>
                  Did you mean <span className="font-medium break-all text-foreground">{sentSuggestion}</span>? Links
                  sent to a mistyped address never arrive.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  disabled={resending}
                  onClick={() => onResend(sentSuggestion)}
                >
                  Send to {sentSuggestion} instead
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {devMailbox && (
            <Alert variant="brand">
              <Inbox aria-hidden />
              <AlertDescription>
                <p>Development mode: emails aren&apos;t delivered. Open the dev mailbox to click your link.</p>
              </AlertDescription>
            </Alert>
          )}
          {devMailbox && (
            <Button asChild variant="brand" size="lg" className="w-full rounded-[3px]">
              <Link href="/dev/emails" target="_blank" rel="noopener">
                <Inbox aria-hidden />
                Open dev mailbox
                <span className="sr-only">(opens in a new tab)</span>
              </Link>
            </Button>
          )}
          {webmail && (
            <Button asChild variant="brand" size="lg" className="w-full rounded-[3px]">
              <a href={webmail.href} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                Open {webmail.label}
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
          )}
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
            No email after a minute? Check your spam or promotions folder, then resend.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:justify-between">
          <Button variant="ghost" className="w-full rounded-[3px] sm:w-auto sm:-ml-3" onClick={editEmail}>
            <ArrowLeft aria-hidden />
            Use a different email
          </Button>
          {/* aria-disabled, not disabled: a focused button that becomes disabled drops focus to <body>. */}
          <Button
            variant="outline"
            className="w-full rounded-[3px] tabular-nums aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:w-auto"
            onClick={() => onResend()}
            aria-disabled={resendBlocked || undefined}
            aria-describedby={cooldown > 0 && !resending ? `${hintId}-cooldown` : undefined}
          >
            {resending ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCw aria-hidden />}
            {/* The countdown ticks every second: keep it out of the accessible name. */}
            <span aria-hidden="true">
              {resending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend link"}
            </span>
            <span className="sr-only">{resending ? "Sending a new link" : "Resend link"}</span>
          </Button>
          {cooldown > 0 && !resending && (
            <span id={`${hintId}-cooldown`} className="sr-only">
              Available again in {cooldown} seconds.
            </span>
          )}
        </div>
      </div>
    );
  }

  const sending = status === "sending";
  const describedBy = [error ? errorId : null, suggestion ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <SheetKicker>Sign in or sign up</SheetKicker>
      <SheetTitle>Sign in to {APP.name}</SheetTitle>
      <p className="mt-3 text-sm text-muted-foreground">
        New here? Enter your email and we&apos;ll create your account. No password needed.
      </p>
      <div className="mt-6 grid gap-4">
        {error && (
          <Alert variant="destructive" role="alert" id={errorId}>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={emailId} className="font-mono text-[11px] tracking-[0.16em] uppercase">
              Email
            </Label>
            <Input
              ref={inputRef}
              id={emailId}
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              className="h-11 rounded-[3px] bg-background text-base sm:text-sm"
              autoFocus
            />
            <div id={hintId} aria-live="polite" className="empty:hidden">
              {suggestion && (
                <p className="text-sm text-muted-foreground">
                  Did you mean{" "}
                  <button
                    type="button"
                    className="rounded-sm font-medium break-all text-foreground underline underline-offset-2 hover:decoration-primary"
                    onClick={() => {
                      setEmail(suggestion);
                      inputRef.current?.focus();
                    }}
                  >
                    {suggestion}
                  </button>
                  ?
                </p>
              )}
            </div>
          </div>
          <Button
            type="submit"
            variant="brand"
            size="lg"
            className="w-full rounded-[3px]"
            disabled={sending || googlePending}
          >
            {sending && <Loader2 className="animate-spin" aria-hidden />}
            {sending ? "Sending link…" : "Send magic link"}
          </Button>
        </form>

        {googleEnabled && (
          <>
            <div className="mono-caps flex items-center gap-3 text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full rounded-[3px]"
              onClick={onGoogle}
              disabled={sending || googlePending}
              aria-busy={googlePending || undefined}
            >
              {googlePending ? <Loader2 className="animate-spin" aria-hidden /> : <GoogleIcon className="size-5" />}
              {googlePending ? "Opening Google…" : "Continue with Google"}
            </Button>
          </>
        )}
      </div>
      <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
        By continuing you agree to our{" "}
        <Link
          href="/legal/terms"
          className="underline decoration-foreground/30 underline-offset-2 hover:text-foreground hover:decoration-safelight-ink"
        >
          Terms
        </Link>{" "}
        and{" "}
        <Link
          href="/legal/privacy"
          className="underline decoration-foreground/30 underline-offset-2 hover:text-foreground hover:decoration-safelight-ink"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
