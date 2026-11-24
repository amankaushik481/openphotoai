"use client";

import { CircleAlertIcon, CircleCheckIcon, CircleDashedIcon, ImagePlusIcon, LoaderCircleIcon, ScanFaceIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ModelStatus } from "@/types/domain";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

const ICON: Record<ModelStatus, typeof ScanFaceIcon> = {
  awaiting_consent: ScanFaceIcon,
  collecting: ImagePlusIcon,
  training: LoaderCircleIcon,
  ready: CircleCheckIcon,
  failed: CircleAlertIcon,
  deleting: CircleDashedIcon,
};

const VARIANT: Record<ModelStatus, "outline" | "secondary" | "soft" | "success" | "destructive"> = {
  awaiting_consent: "outline",
  collecting: "secondary",
  training: "soft",
  ready: "success",
  failed: "destructive",
  deleting: "outline",
};

export function ModelStatusBadge({ status, className }: { status: ModelStatus; className?: string }) {
  const t = useT();
  const Icon = ICON[status];
  return (
    <Badge variant={VARIANT[status]} className={className}>
      <Icon aria-hidden="true" className={cn(status === "training" && "animate-spin")} />
      {t(`models.status.${status}`)}
    </Badge>
  );
}

export function ModeBadge({ mode, className }: { mode: "instant" | "trained"; className?: string }) {
  return (
    <Badge variant={mode === "instant" ? "outline" : "brand"} className={className}>
      {mode === "instant" ? "Instant" : "Trained"}
    </Badge>
  );
}
