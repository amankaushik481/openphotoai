"use client";

import * as React from "react";
import Link from "next/link";
import { PlusIcon, ScanFaceIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useModels } from "@/hooks/use-models";
import type { IdentityModelDTO } from "@/types/domain";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

export interface ModelPickerProps {
  value: string | null | undefined;
  onValueChange: (modelId: string, model: IdentityModelDTO) => void;
  /** Pick the first ready model automatically when no value is set (default true). */
  autoSelect?: boolean;
  /** Include models shared with the user via multi-person consent (default true). */
  includeShared?: boolean;
  /** Model ids that must not be chosen (e.g. the other person in a Together photo). */
  excludeIds?: readonly string[];
  label?: string;
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function ModelPicker({
  value,
  onValueChange,
  autoSelect = true,
  includeShared = true,
  excludeIds,
  label,
  hideLabel = false,
  disabled = false,
  className,
  id,
}: ModelPickerProps) {
  const t = useT();
  const fallbackId = React.useId();
  const selectId = id ?? fallbackId;
  const { models, isLoading } = useModels();

  const options = React.useMemo(
    () => (models ?? []).filter((m) => (includeShared || !m.shared) && !excludeIds?.includes(m.id)),
    [models, includeShared, excludeIds],
  );
  const firstReady = options.find((m) => m.status === "ready");

  const onChangeRef = React.useRef(onValueChange);
  React.useEffect(() => {
    onChangeRef.current = onValueChange;
  });
  React.useEffect(() => {
    if (autoSelect && !value && firstReady) onChangeRef.current(firstReady.id, firstReady);
  }, [autoSelect, value, firstReady]);

  if (isLoading && !models) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        {!hideLabel && <Skeleton className="h-4 w-24" />}
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className={cn("flex flex-col items-start gap-3 rounded-xl border border-dashed p-4", className)}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ScanFaceIcon aria-hidden="true" className="size-4" />
          {t("models.none")}
        </p>
        <Button asChild variant="brand" size="sm">
          <Link href="/app/models/new">
            <PlusIcon />
            {t("dashboard.createModelCta")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={selectId} className={cn(hideLabel && "sr-only")}>
        {label ?? t("models.pick")}
      </Label>
      <Select
        value={value ?? undefined}
        disabled={disabled}
        onValueChange={(next) => {
          const model = options.find((m) => m.id === next);
          if (model) onValueChange(next, model);
        }}
      >
        <SelectTrigger id={selectId} className="h-11 w-full data-[size=default]:h-11">
          <SelectValue placeholder={t("models.placeholder")} />
        </SelectTrigger>
        <SelectContent>
          {options.map((m) => (
            <SelectItem key={m.id} value={m.id} disabled={m.status !== "ready"}>
              <ModelOption model={m} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Link
        href="/app/models/new"
        className="inline-flex w-fit items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <PlusIcon aria-hidden="true" className="size-3.5" />
        {t("models.createNew")}
      </Link>
    </div>
  );
}

function ModelOption({ model }: { model: IdentityModelDTO }) {
  const t = useT();
  const detail =
    model.status !== "ready"
      ? t(`models.status.${model.status}`)
      : model.shared && model.ownerName
        ? t("models.sharedBy", { name: model.ownerName })
        : null;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar className="size-6 rounded-md">
        {model.coverUrl && <AvatarImage src={model.coverUrl} alt="" />}
        <AvatarFallback className="rounded-md bg-brand-soft text-[10px] text-brand-soft-foreground">
          {model.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{model.name}</span>
      {detail && <span className="truncate text-xs text-muted-foreground">· {detail}</span>}
    </span>
  );
}
