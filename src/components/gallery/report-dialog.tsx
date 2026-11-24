"use client";

import * as React from "react";
import { CircleCheckIcon, FlagIcon, LoaderCircleIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { APP } from "@/config/app";
import { focusOnMount } from "@/lib/a11y";
import { ApiClientError, api } from "@/lib/api-client";
import { REPORT_DETAILS_MAX, type ReportReason } from "@/server/gallery/dto";
import { errorMessage } from "@/i18n";

const REASONS: { value: ReportReason; label: string; hint: string }[] = [
  {
    value: "non_consensual",
    label: "It shows me or someone I know without consent",
    hint: "Including look-alikes and deepfakes",
  },
  { value: "sexual", label: "Sexual or explicit content", hint: "Nudity or sexualized imagery" },
  { value: "minor", label: "It involves a minor", hint: "Anyone who looks under 18" },
  { value: "impersonation", label: "Impersonation", hint: "Pretends to be a real person or public figure" },
  { value: "harassment", label: "Harassment, hate or violence", hint: "Targets or demeans someone" },
  { value: "copyright", label: "Copyright or trademark", hint: "Uses work or brands that aren't theirs" },
  { value: "other", label: "Something else", hint: "Tell us below" },
];

export interface ReportDialogProps {
  shareToken: string;
  /** For folder shares: the item being reported (optional). */
  mediaId?: string;
  triggerClassName?: string;
}

export function ReportDialog({ shareToken, mediaId, triggerClassName }: ReportDialogProps) {
  const ids = { details: React.useId(), email: React.useId(), reasons: React.useId() };
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<ReportReason | "">("");
  const [details, setDetails] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next && done) {
      // Start fresh next time (e.g. a second item in a shared folder).
      setDone(false);
      setReason("");
      setDetails("");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      setError("Choose a reason.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api("/api/reports", {
        method: "POST",
        body: {
          shareToken,
          ...(mediaId ? { mediaId } : {}),
          reason,
          ...(details.trim() ? { details: details.trim() } : {}),
          ...(email.trim() ? { email: email.trim() } : {}),
        },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message || errorMessage(err.code) : errorMessage(undefined));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className={triggerClassName}>
          <FlagIcon aria-hidden="true" />
          Report
        </Button>
      </DialogTrigger>
      <DialogContent>
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CircleCheckIcon aria-hidden="true" className="size-10 text-emerald-500" />
            {/* The form (and its focused submit button) was replaced: focus the new title so it's announced. */}
            <DialogTitle tabIndex={-1} ref={focusOnMount} className="focus:outline-hidden">
              Thanks — we received your report
            </DialogTitle>
            <DialogDescription>
              Our team reviews every report. Reports about non-consensual or harmful content are handled first.
              {email.trim() ? " We'll use your email if we need to follow up." : ""} For urgent takedowns, email{" "}
              <a
                href={`mailto:${APP.takedownEmail}`}
                className="font-medium text-foreground underline underline-offset-4"
              >
                {APP.takedownEmail}
              </a>
              .
            </DialogDescription>
            <DialogClose asChild>
              <Button type="button" className="mt-2">
                Close
              </Button>
            </DialogClose>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-5" noValidate>
            <DialogHeader>
              <DialogTitle>Report this content</DialogTitle>
              <DialogDescription>
                Tell us what&apos;s wrong. Reports are confidential — the person who shared this isn&apos;t told who
                reported it.
              </DialogDescription>
            </DialogHeader>

            <fieldset className="grid gap-3">
              <legend id={ids.reasons} className="mb-2 text-sm font-medium">
                Reason
              </legend>
              <RadioGroup
                value={reason}
                onValueChange={(v) => setReason(v as ReportReason)}
                aria-labelledby={ids.reasons}
                aria-required="true"
                className="gap-2"
              >
                {REASONS.map((r) => {
                  const id = `${ids.reasons}-${r.value}`;
                  return (
                    <Label
                      key={r.value}
                      htmlFor={id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/50"
                    >
                      <RadioGroupItem id={id} value={r.value} className="mt-0.5" />
                      <span className="grid gap-0.5">
                        <span className="text-sm font-medium">{r.label}</span>
                        <span className="text-xs text-muted-foreground">{r.hint}</span>
                      </span>
                    </Label>
                  );
                })}
              </RadioGroup>
            </fieldset>

            <div className="grid gap-2">
              <Label htmlFor={ids.details}>Details (optional)</Label>
              <Textarea
                id={ids.details}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={REPORT_DETAILS_MAX}
                rows={3}
                placeholder="Anything that helps us act quickly, e.g. “This is me and I never agreed to this.”"
              />
              <p className="text-right text-xs text-muted-foreground tabular-nums">
                {details.length}/{REPORT_DETAILS_MAX}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor={ids.email}>Your email (optional)</Label>
              <Input
                id={ids.email}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="So we can follow up"
              />
            </div>

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {pending && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
                Send report
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
