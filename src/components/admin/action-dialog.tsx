"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";

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
import { apiErrorText } from "@/lib/api-client";

/** Message for a failed admin action (server message first). */
export function actionErrorMessage(err: unknown): string {
  return apiErrorText(err);
}

export interface ActionDialogProps {
  /** Element that opens the dialog (rendered with `asChild`). */
  trigger: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  submitLabel: string;
  destructive?: boolean;
  /** Runs with the form data; resolves to the success toast text. Throw to keep the dialog open. */
  onSubmit: (data: FormData) => Promise<string>;
  /** Form fields (native validation attributes are honored). */
  children?: React.ReactNode;
}

/**
 * Confirm dialog with a small form for admin actions: native validation, a spinner while the
 * request runs, a toast with the outcome and a server refresh on success.
 */
export function ActionDialog({ trigger, title, description, submitLabel, destructive, onSubmit, children }: ActionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const message = await onSubmit(new FormData(event.currentTarget));
      toast.success(message);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(actionErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending} aria-busy={pending}>
              {pending && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Labelled form field wrapper; give the control `aria-describedby={`${id}-hint`}` when there's a hint. */
export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
