"use client";

import { ArrowLeft, Inbox, Loader2, Mail, MailCheck } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP } from "@/config/app";
import { focusOnMount } from "@/lib/a11y";
import { signIn } from "@/lib/auth-client";
import { GoogleIcon } from "./google-icon";

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

export function LoginForm({ callbackURL, errorCallbackURL, googleEnabled, devMailbox, initialError }: LoginFormProps) {
  const emailId = useId();
  const errorId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [googlePending, setGooglePending] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function sendLink(): Promise<boolean> {
    setError(null);
    setStatus("sending");
    const { error: err } = await signIn.magicLink({ email: email.trim(), callbackURL, errorCallbackURL });
    if (err) {
      setStatus("idle");
      setError(err.message || "We couldn't send the link. Please try again.");
      return false;
    }
    setStatus("sent");
    return true;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await sendLink();
  }

  async function onResend() {
    if (await sendLink()) toast.success("A new sign-in link is on its way.");
  }

  async function onGoogle() {
    setError(null);
    setGooglePending(true);
    const { error: err } = await signIn.social({ provider: "google", callbackURL, errorCallbackURL });
    // On success the browser is already navigating to Google.
    if (err) {
      setGooglePending(false);
      setError(err.message || "Google sign-in is unavailable right now.");
    }
  }

  if (status === "sent") {
    return (
      <Card>
        <CardHeader className="justify-items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
            <MailCheck className="size-6" aria-hidden />
          </div>
          {/* The form (and its focused button) was replaced: focus the new title so it's announced. */}
          <CardTitle as="h1" tabIndex={-1} ref={focusOnMount} className="text-xl focus:outline-hidden">
            Check your inbox
          </CardTitle>
          <CardDescription>
            We sent a sign-in link to <span className="font-medium break-all text-foreground">{email.trim()}</span>. It
            expires in 15 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3" aria-live="polite">
          {devMailbox && (
            <Alert variant="brand">
              <Inbox aria-hidden />
              <AlertDescription>
                <p>Development mode: emails aren&apos;t delivered. Open the dev mailbox to click your link.</p>
              </AlertDescription>
            </Alert>
          )}
          {devMailbox && (
            <Button asChild variant="brand" size="lg" className="w-full">
              <Link href="/dev/emails" target="_blank" rel="noopener">
                <Inbox aria-hidden />
                Open dev mailbox
                <span className="sr-only">(opens in a new tab)</span>
              </Link>
            </Button>
          )}
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <p className="text-center text-sm text-muted-foreground">
            No email after a minute? Check your spam folder or resend.
          </p>
        </CardContent>
        <CardFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setStatus("idle")}>
            <ArrowLeft aria-hidden />
            Use a different email
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={onResend}>
            Resend link
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const sending = status === "sending";
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle as="h1" className="text-xl">
          Sign in to {APP.name}
        </CardTitle>
        <CardDescription>New here? Enter your email and we&apos;ll create your account.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Alert variant="destructive" role="alert" id={errorId}>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={emailId}>Email</Label>
            <Input
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
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="h-11"
              autoFocus
            />
          </div>
          <Button type="submit" variant="brand" size="lg" className="w-full" disabled={sending || googlePending}>
            {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />}
            {sending ? "Sending link…" : "Send magic link"}
          </Button>
        </form>

        {googleEnabled && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              onClick={onGoogle}
              disabled={sending || googlePending}
            >
              {googlePending ? <Loader2 className="animate-spin" aria-hidden /> : <GoogleIcon className="size-5" />}
              Continue with Google
            </Button>
          </>
        )}
      </CardContent>
      <CardFooter>
        <p className="w-full text-center text-xs text-muted-foreground">
          By continuing you agree to our{" "}
          <Link href="/legal/terms" className="underline underline-offset-2 hover:text-foreground">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
      </CardFooter>
    </Card>
  );
}
