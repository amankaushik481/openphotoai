"use client";

import { LoaderCircleIcon, MailCheckIcon, Trash2Icon } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { apiErrorText } from "./client-errors";
import { DeletionScope } from "./deletion-scope";

const CONFIRM_WORD = "DELETE";

interface DeletionRequested {
  expiresInHours: number;
}

/** `linkTtlHours`: how long the emailed confirmation link works (DELETION_LINK_TTL_HOURS). */
export function DangerZoneCard({ email, linkTtlHours = 24 }: { email: string; linkTtlHours?: number }) {
  const inputId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<DeletionRequested | null>(null);
  const confirmed = typed.trim() === CONFIRM_WORD;

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) {
      setTyped("");
      setError(null);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirmed) return;
    setPending(true);
    setError(null);
    try {
      const res = await api<{ ok: true; expiresInHours: number }>("/api/account/delete", { method: "POST" });
      setSent({ expiresInHours: res.expiresInHours });
      setOpen(false);
      setTyped("");
    } catch (err) {
      setError(apiErrorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Delete account</CardTitle>
        <CardDescription>
          Permanently delete your account and everything in it. This can&apos;t be undone — download your data first
          if you want to keep anything.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <DeletionScope />
        {sent && (
          <Alert variant="brand" role="status">
            <MailCheckIcon aria-hidden />
            <AlertTitle>We emailed you a confirmation link</AlertTitle>
            <AlertDescription>
              Open the email we sent to <span className="font-medium text-foreground">{email}</span> and confirm there.
              Nothing is deleted until you do; the link expires in {sent.expiresInHours} hours.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="justify-end border-t pt-6">
        <Button variant="destructive" onClick={() => onOpenChange(true)}>
          <Trash2Icon aria-hidden />
          {sent ? "Send a new link" : "Delete my account…"}
        </Button>
      </CardFooter>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>Deletion takes two steps, so nobody can do it by accident (or from your unlocked laptop).</DialogDescription>
            </DialogHeader>
            <ol className="grid gap-2 text-sm">
              {[
                <>
                  We email a confirmation link to <span className="font-medium break-all">{email}</span>. It works for{" "}
                  {linkTtlHours} hours.
                </>,
                <>Open it and press “Delete my account permanently”. Until then, nothing is deleted and you can keep using your account.</>,
                <>Everything listed on this page is erased right away and can&apos;t be recovered. You get a final email when it&apos;s done.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-xs font-semibold text-destructive"
                  >
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="grid gap-2">
              <Label htmlFor={inputId}>
                Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to continue
              </Label>
              <Input
                id={inputId}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
              />
              {error && (
                <p id={errorId} role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={!confirmed || pending} aria-busy={pending}>
                {pending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
                Email me the confirmation link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
