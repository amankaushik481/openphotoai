"use client";

import * as React from "react";
import { LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api-client";
import { errorMessage } from "@/i18n";
import { useT } from "@/i18n/react";

export interface ConfirmDialogProps {
  /** Element that opens the dialog (rendered with `asChild`). Omit when controlling `open`. */
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** May be async; the dialog stays open with a spinner until it settles, and closes on success. */
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  trigger,
  open: openProp,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const t = useT();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const open = openProp ?? uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (pending) return;
    if (openProp === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      if (openProp === undefined) setUncontrolledOpen(false);
      onOpenChange?.(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message || errorMessage(err.code) : t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel ?? t("common.cancel")}</AlertDialogCancel>
          {/* A plain Button (not AlertDialogAction) so the dialog stays open while onConfirm runs. */}
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={pending}
            aria-busy={pending}
          >
            {pending && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
            {confirmLabel ?? t("common.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
