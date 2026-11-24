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

export interface EnhanceQuickActionsProps {
  media: MediaDTO;
  onJobCreated?: (job: JobDTO) => void;
  className?: string;
}

interface QuickAction {
  action: EnhanceAction;
  label: string;
  done: string;
  icon: React.ReactNode;
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  { action: "upscale", label: "Upscale 2×", done: "Upscaled 2×", icon: <ImageUpscaleIcon aria-hidden="true" /> },
  { action: "face_restore", label: "Restore face", done: "Face restored", icon: <ScanFaceIcon aria-hidden="true" /> },
  {
    action: "remove_background",
    label: "Remove background",
    done: "Background removed",
    icon: <EraserIcon aria-hidden="true" />,
  },
];

/** Compact one-click enhancements for the gallery viewer (upscale 2×, restore face, remove bg). */
export function EnhanceQuickActions({ media, onJobCreated, className }: EnhanceQuickActionsProps) {
  return (
    <div role="group" aria-label="Quick enhancements" className={cn("flex items-center gap-1", className)}>
      {QUICK_ACTIONS.map((a) => (
        // Keyed by photo so a running job's spinner doesn't follow the viewer to the next photo.
        <QuickActionButton key={`${media.id}:${a.action}`} media={media} spec={a} onJobCreated={onJobCreated} />
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
  const costLabel = cost === 1 ? "1 credit" : `${cost} credits`;

  const { busy, run } = useEnhanceJobWithToasts(spec, onJobCreated, {
    open: (id) => router.push(`/app/gallery/${id}`),
    billing: () => router.push("/app/billing"),
    jobError: (job) => friendlyJobError(job, t),
  });

  const label = `${spec.label} (${costLabel})`;
  const tooltip = availability.reason ?? label;
  const button = (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={busy ? `${spec.label}: working…` : label}
      aria-busy={busy || undefined}
      disabled={!availability.available || busy}
      onClick={() => void run(enhanceRequest(spec.action, media.id))}
    >
      {busy ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : spec.icon}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Disabled buttons get no pointer/focus events: a focusable wrapper keeps the reason reachable. */}
        {availability.available ? button : <span tabIndex={0} aria-label={`${spec.label}: ${tooltip}`}>{button}</span>}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function useEnhanceJobWithToasts(
  spec: QuickAction,
  onJobCreated: ((job: JobDTO) => void) | undefined,
  nav: { open: (mediaId: string) => void; billing: () => void; jobError: (job: JobDTO) => string | null },
) {
  return useEnhanceJob({
    onJobCreated: (job) => {
      toast(`${spec.label} started`, { description: "We'll let you know when it's ready." });
      onJobCreated?.(job);
    },
    onTerminal: (job) => {
      const output = job.media[0];
      if (job.status === "succeeded" && output) {
        toast.success(spec.done, { action: { label: "Open", onClick: () => nav.open(output.id) } });
      } else {
        toast.error(`${spec.label} didn't work`, { description: nav.jobError(job) ?? undefined });
      }
    },
    onError: (error) =>
      toast.error(error.message, error.buyCredits ? { action: { label: "Buy credits", onClick: nav.billing } } : undefined),
  });
}

// Imported last to keep the hook wrapper above readable; plain ESM import hoisting applies.
import { useEnhanceJob } from "./use-enhance-job";
