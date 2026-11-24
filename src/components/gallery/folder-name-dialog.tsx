"use client";

import * as React from "react";
import { LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { ApiClientError } from "@/lib/api-client";
import { FOLDER_NAME_MAX } from "@/server/gallery/dto";
import { errorMessage } from "@/i18n";
import { useT } from "@/i18n/react";

export interface FolderNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  initialName?: string;
  /** Resolve to close the dialog; throw to keep it open (the error is shown). */
  onSubmit: (name: string) => Promise<void>;
}

export function FolderNameDialog({ open, onOpenChange, ...formProps }: FolderNameDialogProps) {
  const [pending, setPending] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        {/* Mounted only while open, so the field starts from `initialName` every time. */}
        <FolderNameForm {...formProps} pending={pending} setPending={setPending} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function FolderNameForm({
  title,
  description,
  submitLabel,
  initialName = "",
  onSubmit,
  pending,
  setPending,
  onDone,
}: Omit<FolderNameDialogProps, "open" | "onOpenChange"> & {
  pending: boolean;
  setPending: (pending: boolean) => void;
  onDone: () => void;
}) {
  const t = useT();
  const inputId = React.useId();
  const [name, setName] = React.useState(initialName);
  const trimmed = name.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || pending) return;
    setPending(true);
    try {
      await onSubmit(trimmed);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message || errorMessage(err.code) : t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor={inputId}>Folder name</Label>
        <Input
          id={inputId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={FOLDER_NAME_MAX}
          placeholder="e.g. LinkedIn picks"
          autoComplete="off"
          autoFocus
          required
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!trimmed || pending} aria-busy={pending}>
          {pending && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
