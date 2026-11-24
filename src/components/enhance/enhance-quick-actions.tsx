"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { EraserIcon, ImageUpscaleIcon, LoaderCircleIcon, ScanFaceIcon } from "lucide-react";
import { toast } from "sonner";

import { friendlyJobError } from "@/components/app/job-progress";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";
import type { JobDTO, MediaDTO } from "@/types/domain";
import { actionAvailability, enhanceCost, enhanceRequest, type EnhanceAction } from "./enhance-ui";
import { useEnhanceJob } from "./use-enhance-job";

export interface EnhanceQuickActionsProps {
  media: MediaDTO;
  onJobCreated?: (job: JobDTO) => void;
  className?: string;
}

interface QuickAction {
  action: EnhanceAction;
  label: string;
  done: string;
  Icon: typeof ImageUpscaleIcon;
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  { action: "upscale", label: "Upscale 2×", done: "Upscaled 2×", Icon: ImageUpscaleIcon },
  { action: "face_restore", label: "Restore face", done: "Face restored", Icon: ScanFaceIcon },
  { action: "remove_background", label: "Remove background", done: "Background removed", Icon: EraserIcon },
];

/** Compact one-click enhancements for the gallery viewer: upscale 2×, restore face, remove background. */
export function EnhanceQuickActions({ media, onJobCreated, className }: EnhanceQuickActionsProps) {
  return (
    <div role="group" aria-label="Quick enhancements" className={cn("flex flex-wrap items-center gap-1", className)}>
      {QUICK_ACTIONS.map((spec) => (
        // Keyed by photo so a running job's spinner doesn't follow the viewer to the next photo.
        <QuickActionButton key={`${media.id}:${spec.action}`} media={media} spec={spec} onJobCreated={onJobCreated} />
      ))}
    </div>
  );
}

function QuickActionButton({
  media,
  spec,
  onJobCreated,
}: {
  media: MediaDTO;
  spec: QuickAction;
  onJobCreated?: (job: JobDTO) => void;
}) {
  const t = useT();
  const router = useRouter();
  const availability = actionAvailability(media, spec.action);
  const cost = enhanceCost(spec.action);
  const label = `${spec.label} (${cost === 1 ? "1 credit" : `${cost} credits`})`;

  const { busy, run } = useEnhanceJob({
    onJobCreated: (job) => {
      toast(`${spec.label} started`, { description: "We'll let you know when it's ready." });
      onJobCreated?.(job);
    },
    onTerminal: (job) => {
      const output = job.media[0];
      if (job.status === "succeeded" && output) {
        // Toasts with an action stay until dismissed, so keyboard/screen-reader users can reach it.
        toast.success(spec.done, {
          duration: Infinity,
          action: { label: "Open", onClick: () => router.push(`/app/gallery/${output.id}`) },
        });
      } else {
        toast.error(`${spec.label} didn't work`, { description: friendlyJobError(job, t) ?? undefined });
      }
    },
    onError: (error) =>
      toast.error(
        error.message,
        error.buyCredits
          ? { duration: Infinity, action: { label: "Buy credits", onClick: () => router.push("/app/billing") } }
          : undefined,
      ),
  });

  // aria-disabled (not `disabled`) keeps the button focusable/hoverable so the tooltip can explain why.
  const blocked = !availability.available || busy;
  const tooltip = availability.reason ?? (busy ? `${spec.label}: working…` : label);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={availability.reason ? `${spec.label}: ${availability.reason}` : tooltip}
          aria-disabled={blocked || undefined}
          aria-busy={busy || undefined}
          // Touch has no hover tooltip: show the name and credit cost before a tap starts a paid job.
          className={cn(
            "pointer-coarse:w-auto pointer-coarse:px-2.5",
            !availability.available && "cursor-not-allowed opacity-50",
          )}
          onClick={() => {
            if (!blocked) void run(enhanceRequest(spec.action, media.id));
          }}
        >
          {busy ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : <spec.Icon aria-hidden="true" />}
          <span aria-hidden="true" className="hidden text-xs pointer-coarse:inline">
            {label}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
