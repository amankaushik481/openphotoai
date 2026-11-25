"use client";

import * as React from "react";
import Link from "next/link";
import {
  EraserIcon,
  ImageUpscaleIcon,
  LoaderCircleIcon,
  ScanFaceIcon,
  TriangleAlertIcon,
  VideoOffIcon,
} from "lucide-react";

import { CostHint } from "@/components/app/cost-hint";
import { JobProgress } from "@/components/app/job-progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { CreateJobRequest, JobDTO, MediaDTO } from "@/types/domain";
import { UPSCALE_SCALES, VIDEO_NOT_SUPPORTED_MESSAGE, type UpscaleScale } from "./enhance-rules";
import { EnhanceResult } from "./enhance-result";
import {
  actionAvailability,
  DRAFT_SOURCE_WARNING,
  enhanceRequest,
  formatSize,
  preferredUpscaleScale,
  upscalePreview,
  upscaleScalesFor,
  type Availability,
  type EnhanceErrorInfo,
} from "./enhance-ui";
import { useEnhanceJob } from "./use-enhance-job";
import { STUDIO_LABEL, STUDIO_TOGGLE } from "@/components/edit/studio";

export { EnhanceQuickActions, type EnhanceQuickActionsProps } from "./enhance-quick-actions";

export interface EnhancePanelProps {
  media: MediaDTO;
  onJobCreated?: (job: JobDTO) => void;
  className?: string;
}

/** Upscale / face restore / background removal for one photo, each with cost, progress and result. */
export function EnhancePanel({ media, onJobCreated, className }: EnhancePanelProps) {
  const isVideo = media.kind !== "image";
  return (
    <section aria-label="Enhance photo" className={cn("@container flex flex-col gap-4", className)}>
      {isVideo ? (
        <Alert role="note">
          <VideoOffIcon aria-hidden="true" />
          <AlertTitle>Photos only</AlertTitle>
          <AlertDescription>{VIDEO_NOT_SUPPORTED_MESSAGE}</AlertDescription>
        </Alert>
      ) : (
        media.isDraft && (
          <Alert variant="warning" role="note">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertTitle>Draft preview</AlertTitle>
            <AlertDescription>{DRAFT_SOURCE_WARNING}</AlertDescription>
          </Alert>
        )
      )}
      {/* Keyed by photo so options and job state reset when the viewer moves to another photo. */}
      <div key={media.id} className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
        <UpscaleCard media={media} onJobCreated={onJobCreated} />
        <ActionCard
          media={media}
          icon={<ScanFaceIcon aria-hidden="true" />}
          title="Face restore"
          description="Sharpens eyes, skin and teeth and repairs small facial artifacts without changing who you are."
          runLabel="Restore face"
          resultAlt="Photo with restored face"
          request={enhanceRequest("face_restore", media.id)}
          availability={actionAvailability(media, "face_restore")}
          onJobCreated={onJobCreated}
        />
        <ActionCard
          media={media}
          icon={<EraserIcon aria-hidden="true" />}
          title="Remove background"
          description="Cuts you out on a transparent background (PNG), ready for profiles, slides and designs."
          runLabel="Remove background"
          resultAlt="Photo with the background removed"
          request={enhanceRequest("remove_background", media.id)}
          availability={actionAvailability(media, "remove_background")}
          onJobCreated={onJobCreated}
        />
      </div>
    </section>
  );
}

function UpscaleCard({ media, onJobCreated }: { media: MediaDTO; onJobCreated?: (job: JobDTO) => void }) {
  const [scale, setScale] = React.useState<UpscaleScale>(() => preferredUpscaleScale(media));
  const [faceRestore, setFaceRestore] = React.useState(true);
  const switchId = React.useId();
  const hintId = React.useId();
  const isVideo = media.kind !== "image";
  const allowed = upscaleScalesFor(media);
  const preview = upscalePreview(media, scale);
  // Explain a factor that is off for this photo (e.g. 4× would exceed the maximum size).
  const offScale = allowed.length > 0 ? UPSCALE_SCALES.find((s) => !allowed.includes(s)) : undefined;
  const offReason = offScale ? actionAvailability(media, "upscale", offScale).reason : null;

  return (
    <ActionCard
      media={media}
      icon={<ImageUpscaleIcon aria-hidden="true" />}
      title="Upscale"
      description="A larger, sharper version of this photo for prints and big screens."
      runLabel={`Upscale ${scale}×`}
      resultAlt={`Photo upscaled ${scale}×`}
      request={enhanceRequest("upscale", media.id, { scale, faceRestore })}
      availability={actionAvailability(media, "upscale", scale)}
      onJobCreated={onJobCreated}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={String(scale)}
          onValueChange={(v) => v && setScale(Number(v) as UpscaleScale)}
          aria-label="Upscale factor"
          aria-describedby={hintId}
        >
          {UPSCALE_SCALES.map((s) => (
            <ToggleGroupItem
              key={s}
              value={String(s)}
              disabled={!allowed.includes(s)}
              className={cn("min-w-12 font-mono", STUDIO_TOGGLE)}
            >
              {s}×
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex items-center gap-2">
          <Switch id={switchId} checked={faceRestore} onCheckedChange={setFaceRestore} disabled={isVideo} />
          <Label htmlFor={switchId} className={STUDIO_LABEL}>
            Restore face
          </Label>
        </div>
      </div>
      <p id={hintId} className="font-mono text-xs text-muted-foreground tabular-nums">
        {preview ? (
          <>
            {formatSize(preview.from)} → <span className="font-medium text-foreground">{formatSize(preview.to)}</span>{" "}
            ({preview.megapixels} MP)
          </>
        ) : (
          `Result: ${scale}× the original width and height.`
        )}
      </p>
      {offReason && <p className="text-xs text-muted-foreground">{offReason}</p>}
    </ActionCard>
  );
}

interface ActionCardProps {
  media: MediaDTO;
  icon: React.ReactNode;
  title: string;
  description: string;
  runLabel: string;
  resultAlt: string;
  request: CreateJobRequest;
  availability: Availability;
  onJobCreated?: (job: JobDTO) => void;
  /** Options rendered above the cost hint. */
  children?: React.ReactNode;
}

function ActionCard({
  media,
  icon,
  title,
  description,
  runLabel,
  resultAlt,
  request,
  availability,
  onJobCreated,
  children,
}: ActionCardProps) {
  const headingId = React.useId();
  const reasonId = React.useId();
  const { job, error, busy, run } = useEnhanceJob({ onJobCreated });
  const result = job?.status === "succeeded" ? job.media[0] : undefined;
  const isVideo = media.kind !== "image";

  return (
    <Card role="region" aria-labelledby={headingId} className="gap-4 rounded-none border-foreground/15 py-5 shadow-none">
      <CardHeader className="px-5">
        <CardTitle id={headingId} className="flex items-center gap-2 font-display text-2xl leading-none font-normal">
          <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-5">
        {children}
        {!availability.available && availability.reason && !isVideo && (
          <p id={reasonId} className="text-sm text-muted-foreground">
            {availability.reason}
          </p>
        )}
        {availability.available && <CostHint input={request} />}
        <Button
          onClick={() => void run(request)}
          disabled={!availability.available || busy}
          aria-describedby={!availability.available && !isVideo ? reasonId : undefined}
          aria-busy={busy || undefined}
          className="w-full sm:w-fit"
        >
          {busy ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : icon}
          {runLabel}
        </Button>
        {error && <EnhanceError error={error} />}
        {job && <JobProgress job={job} title={title} bare />}
        {result && <EnhanceResult media={result} alt={resultAlt} />}
      </CardContent>
    </Card>
  );
}

function EnhanceError({ error }: { error: EnhanceErrorInfo }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {error.message}
      {error.buyCredits && (
        <>
          {" "}
          <Link href="/app/billing" className="font-medium underline underline-offset-4">
            Buy credits
          </Link>
        </>
      )}
    </p>
  );
}
