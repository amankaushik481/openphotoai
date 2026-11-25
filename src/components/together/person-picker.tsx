"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { IdentityModelDTO } from "@/types/domain";
import { cn } from "@/lib/utils";
import { initials } from "./format";

export interface PersonOption {
  model: IdentityModelDTO;
  /** Secondary line, e.g. "Shared by Sam" or "Training…". */
  detail?: string;
  disabled?: boolean;
}

export interface PersonPickerProps {
  legend: string;
  description?: React.ReactNode;
  /** Radio group name (unique per page). */
  name: string;
  options: readonly PersonOption[];
  value: string | null;
  onValueChange: (modelId: string) => void;
  /** Shown instead of the options when there are none. */
  empty?: React.ReactNode;
  className?: string;
}

/** Accessible radio-card list of identity models (native radios, keyboard friendly). */
export function PersonPicker({
  legend,
  description,
  name,
  options,
  value,
  onValueChange,
  empty,
  className,
}: PersonPickerProps) {
  const descriptionId = React.useId();
  return (
    <fieldset
      className={cn("flex min-w-0 flex-col gap-2", className)}
      aria-describedby={description ? descriptionId : undefined}
    >
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {description && (
        <p id={descriptionId} className="-mt-1 text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {options.length === 0 ? (
        empty
      ) : (
        <div className="grid gap-2">
          {options.map(({ model, detail, disabled }) => {
            const checked = value === model.id;
            return (
              <label
                key={model.id}
                className={cn(
                  "relative flex min-h-14 cursor-pointer items-center gap-3 rounded-sm border border-foreground/15 bg-card px-3 py-2 transition-colors",
                  "hover:bg-accent/50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                  checked && "border-safelight-ink bg-accent/60",
                  disabled && "cursor-not-allowed opacity-60 hover:bg-card",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={model.id}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onValueChange(model.id)}
                  className="sr-only"
                />
                <Avatar className="size-10 rounded-none">
                  {model.coverUrl && <AvatarImage src={model.coverUrl} alt="" />}
                  <AvatarFallback className="rounded-none bg-secondary font-mono text-[11px] text-foreground">
                    {initials(model.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{model.name}</span>
                  {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center border",
                    checked ? "border-safelight-ink bg-safelight text-white" : "border-input",
                  )}
                >
                  {checked && <CheckIcon className="size-3.5" />}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

const STATUS_DETAIL: Partial<Record<IdentityModelDTO["status"], string>> = {
  awaiting_consent: "Needs a consent selfie",
  collecting: "Add photos to finish",
  training: "Training…",
  failed: "Training failed",
  deleting: "Being deleted",
};

/** Default detail line for a model option. */
export function modelDetail(model: IdentityModelDTO): string | undefined {
  if (model.status !== "ready") return STATUS_DETAIL[model.status];
  if (model.shared) return model.ownerName ? `Shared by ${model.ownerName}` : "Shared with you";
  return undefined;
}
