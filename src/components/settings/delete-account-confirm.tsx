"use client";

import { CircleCheckIcon, LoaderCircleIcon, RotateCwIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api, ApiClientError } from "@/lib/api-client";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { apiErrorText } from "./client-errors";
import { DeletionScope } from "./deletion-scope";

type Phase =
  | { kind: "idle" }
  | { kind: "deleting" }
  | { kind: "in_progress" }
  | { kind: "done" }
  | { kind: "error"; message: string }
  | { kind: "invalid" }
  | { kind: "expired" };

/** Shown while the (synchronous) deletion request runs; mirrors the server's step order. */
const STEP_LABELS = [
  "Signing you out everywhere…",
  "Canceling your subscription…",
  "Deleting your models at our AI provider…",
  "Deleting your photos, videos and selfies…",
  "Removing your account…",
] as const;

function stepLabel(progress: number): string {
  const index = Math.min(STEP_LABELS.length - 1, Math.floor((progress / 90) * STEP_LABELS.length));
  return STEP_LABELS[index]!;
}

function StatusIcon({ tone, children }: { tone: "danger" | "success" | "warning"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mb-2 flex size-12 items-center justify-center rounded-full",
        tone === "danger" && "bg-destructive/10 text-destructive",
        tone === "success" && "bg-success/10 text-success",
        tone === "warning" && "bg-warning/10 text-warning",
      )}
    >
      {children}
    </div>
  );
}

export function DeleteAccountConfirm({ token }: { token: string | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(token ? { kind: "idle" } : { kind: "invalid" });
  const [progress, setProgress] = useState(0);

  // Indeterminate work: ease towards 90% until the server answers.
  useEffect(() => {
    if (phase.kind !== "deleting") return;
    const timer = setInterval(() => setProgress((p) => Math.min(90, p + Math.max(1, (90 - p) / 10))), 500);
    return () => clearInterval(timer);
  }, [phase.kind]);

  async function onConfirm() {
    if (!token) return;
    setProgress(5);
    setPhase({ kind: "deleting" });
    try {
      const res = await api<{ ok: true; status: "completed" | "in_progress" }>("/api/account/delete/confirm", {
        method: "POST",
        body: { token },
      });
      if (res.status === "in_progress") {
        setPhase({ kind: "in_progress" });
        return;
      }
      setProgress(100);
      setPhase({ kind: "done" });
      // The server already dropped every session; this clears the cookie in this browser.
      await signOut().catch(() => undefined);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "not_found") {
        const reason = (err.details as { reason?: string } | undefined)?.reason;
        setPhase({ kind: reason === "expired" ? "expired" : "invalid" });
        return;
      }
      setPhase({ kind: "error", message: apiErrorText(err) });
    }
  }

  const live = (
    <p className="sr-only" aria-live="polite">
      {phase.kind === "deleting" ? stepLabel(progress) : phase.kind === "done" ? "Your account was deleted." : ""}
    </p>
  );

  if (phase.kind === "done") {
    return (
      <Card>
        {live}
        <CardHeader className="justify-items-center text-center">
          <StatusIcon tone="success">
            <CircleCheckIcon className="size-6" aria-hidden />
          </StatusIcon>
          <CardTitle as="h1" className="text-xl">
            Your account and all data were deleted
          </CardTitle>
          <CardDescription>
            We sent a final confirmation to your email address. You&apos;ve been signed out on this device.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">Back to home</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (phase.kind === "invalid" || phase.kind === "expired") {
    const expired = phase.kind === "expired";
    return (
      <Card>
        <CardHeader className="justify-items-center text-center">
          <StatusIcon tone="warning">
            <TriangleAlertIcon className="size-6" aria-hidden />
          </StatusIcon>
          <CardTitle as="h1" className="text-xl">
            {expired ? "This link has expired" : "This link doesn't work"}
          </CardTitle>
          <CardDescription>
            {expired
              ? "Deletion links are valid for 24 hours. Nothing was deleted — request a new link from Settings."
              : "It may be incomplete, or replaced by a newer link. Use the latest email, or request a new link from Settings."}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex-col gap-2">
          <Button asChild variant="outline" className="w-full">
            <Link href="/app/settings">Go to Settings</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/">Back to home</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const busy = phase.kind === "deleting";
  return (
    <Card>
      {live}
      <CardHeader className="justify-items-center text-center">
        <StatusIcon tone="danger">
          {busy ? <LoaderCircleIcon className="size-6 animate-spin" aria-hidden /> : <Trash2Icon className="size-6" aria-hidden />}
        </StatusIcon>
        <CardTitle as="h1" className="text-xl">
          {busy ? "Deleting your account…" : "Delete your account permanently"}
        </CardTitle>
        <CardDescription>
          {busy
            ? "Keep this page open. It usually takes a few seconds."
            : "This is the final step. It can't be undone and we can't recover anything afterwards."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {busy ? (
          <div className="grid gap-2">
            <Progress value={progress} aria-label="Deletion progress" />
            <p className="text-center text-sm text-muted-foreground">{stepLabel(progress)}</p>
          </div>
        ) : (
          <>
            {phase.kind === "error" && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {phase.message}
              </p>
            )}
            {phase.kind === "in_progress" && (
              <p role="status" className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                Your deletion is already running. Give it a minute, then check again.
              </p>
            )}
            {phase.kind === "idle" && <DeletionScope />}
          </>
        )}
      </CardContent>
      {!busy && (
        <CardFooter className="flex-col gap-2">
          <Button variant="destructive" size="lg" className="w-full" onClick={onConfirm}>
            {phase.kind === "idle" ? <Trash2Icon aria-hidden /> : <RotateCwIcon aria-hidden />}
            {phase.kind === "idle"
              ? "Delete my account permanently"
              : phase.kind === "in_progress"
                ? "Check again"
                : "Try again"}
          </Button>
          {phase.kind === "idle" && (
            <Button asChild variant="ghost" className="w-full">
              <Link href="/app/settings">Keep my account</Link>
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
