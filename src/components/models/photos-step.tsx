"use client";

import * as React from "react";
import { ArrowRightIcon, CameraIcon, RotateCwIcon, ShieldAlertIcon, SunIcon, UsersRoundIcon, XIcon } from "lucide-react";
import type { KeyedMutator } from "swr";

import { ImageDropzone, useUploadItems } from "@/components/app/image-dropzone";
import { isInFlight, sharedUploadQueue, type UploadItem } from "@/components/app/upload-queue";
import { StickyActionBar, StickyActionBarSpacer } from "@/components/create/controls";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { AddPhotoResponse, ModelDetailResponse } from "@/server/models/types";
import { cn } from "@/lib/utils";
import { IssueList, TrainingPhotoGrid } from "./photo-grid";
import { photoStepStatus, rejectionIssues } from "./photo-issues";
import { ReadinessPanel } from "./readiness-panel";
import { modelKey, modelsApi } from "./use-model";

const GUIDE = [
  { icon: CameraIcon, text: "Recent photos of just you: close-ups and head-and-shoulders shots" },
  { icon: SunIcon, text: "Good light, sharp focus, different outfits, places and expressions" },
  { icon: UsersRoundIcon, text: "No group photos, sunglasses, filters or heavy edits" },
] as const;

/**
 * Training-photo uploads of one model. Module-scoped (not component state), so photos keep uploading
 * and their results stay visible when the user leaves the step (Back, another page) and returns.
 */
export const photoUploadQueue = (modelId: string) => sharedUploadQueue<AddPhotoResponse>(`model-photos:${modelId}`);

export interface PhotosStepProps {
  modelId: string;
  detail: ModelDetailResponse;
  mutate: KeyedMutator<ModelDetailResponse>;
  /** Shows a Continue button (enabled once Instant mode is possible and uploads are done). */
  onContinue?: () => void;
}

/** Upload training photos with instant per-photo feedback and a live readiness panel. */
export function PhotosStep({ modelId, detail, mutate, onContinue }: PhotosStepProps) {
  const queue = React.useMemo(() => photoUploadQueue(modelId), [modelId]);
  const items = useUploadItems(queue);
  const failed = items.filter((it) => it.status === "error");
  const pending = items.filter(isInFlight).length;
  const { readinessByMode } = detail;
  const trained = readinessByMode.trained;
  const full = trained.accepted + pending >= trained.maxAllowed;
  const status = photoStepStatus(readinessByMode, pending);

  const onUploaded = (result: AddPhotoResponse) => {
    void mutate(
      (prev) =>
        prev && {
          ...prev,
          photos: [...prev.photos.filter((p) => p.id !== result.photo.id), result.photo],
          readiness: result.readiness,
          readinessByMode: result.readinessByMode,
        },
      { revalidate: false },
    );
  };

  const removePhoto = async (photoId: string) => {
    const res = await modelsApi.deletePhoto(modelId, photoId);
    await mutate(
      (prev) =>
        prev && {
          ...prev,
          model: res.model,
          photos: prev.photos.filter((p) => p.id !== photoId),
        },
      { revalidate: true },
    );
  };

  const continueButton = (className?: string) =>
    onContinue && (
      <Button
        type="button"
        variant="brand"
        size="lg"
        className={className}
        onClick={onContinue}
        disabled={!status.canContinue}
        aria-describedby={status.reason ? "photos-continue-reason" : undefined}
      >
        Continue
        <ArrowRightIcon />
      </Button>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-5">
        <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
          {GUIDE.map(({ icon: Icon, text }) => (
            <li key={text} className="flex gap-2 rounded-lg bg-muted/50 px-3 py-2.5 sm:p-3">
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              {text}
            </li>
          ))}
        </ul>

        <ImageDropzone<AddPhotoResponse>
          endpoint={`${modelKey(modelId)}/photos`}
          queue={queue}
          removeOnSuccess
          concurrency={2}
          disabled={full}
          // Failed photos are explained (with their fix) in the list below instead of as tiles.
          showItem={(item) => item.status !== "error"}
          title={full ? "Your training set is full" : "Add photos of yourself"}
          hint={
            full
              ? "Remove a photo to add another."
              : "Drop or paste photos, or choose them from your files or camera roll. We check each one instantly."
          }
          onUploaded={onUploaded}
          onIdle={() => void mutate()}
        />

        {failed.length > 0 && (
          <NotSavedList
            items={failed}
            onRetry={(id) => queue.retry(id)}
            onDismiss={(id) => queue.remove(id)}
            onClear={() => failed.forEach((it) => queue.remove(it.id))}
          />
        )}

        <TrainingPhotoGrid photos={detail.photos} onDelete={removePhoto} />
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20">
        <ReadinessPanel readiness={trained} instant={readinessByMode.instant} />
        {continueButton("hidden md:inline-flex")}
        {onContinue && status.reason && (
          <p id="photos-continue-reason" className="hidden text-center text-xs text-muted-foreground md:block">
            {status.reason}
          </p>
        )}
      </div>

      {onContinue && (
        <>
          {/* Phones: the counter toward the minimum and Continue stay in reach while scrolling photos. */}
          <StickyActionBar>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="flex items-baseline gap-1.5 text-xs leading-tight">
                <span className="text-sm font-semibold tabular-nums">
                  {trained.accepted}/{trained.minRequired}
                </span>
                <span className="text-muted-foreground">good photos</span>
              </p>
              <Progress
                value={Math.min(100, Math.round((trained.accepted / Math.max(1, trained.minRequired)) * 100))}
                aria-label={`${trained.accepted} of ${trained.minRequired} good photos`}
                className="h-1.5"
                indicatorClassName={cn(trained.canTrain ? "bg-success" : "bg-brand-gradient")}
              />
              <p className="truncate text-xs text-muted-foreground" aria-live="polite">
                {status.detail}
              </p>
            </div>
            {continueButton("h-11 shrink-0")}
          </StickyActionBar>
          <StickyActionBarSpacer />
        </>
      )}
    </div>
  );
}

function NotSavedList({
  items,
  onRetry,
  onDismiss,
  onClear,
}: {
  items: readonly UploadItem<AddPhotoResponse>[];
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <section aria-labelledby="not-saved-title" className="flex flex-col gap-2 rounded-xl border border-destructive/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="not-saved-title" className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlertIcon aria-hidden="true" className="size-4 text-destructive" />
          {items.length === 1 ? "1 photo wasn't saved" : `${items.length} photos weren't saved`}
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const issues = rejectionIssues(item.errorDetails);
          // A rejected photo needs a different photo; anything else (network, busy server) can be retried.
          const retryable = !issues && item.previewUrl !== null;
          return (
            <li key={item.id} className="flex items-start gap-3 border-t pt-3 first:border-t-0 first:pt-0">
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                <img src={item.previewUrl} alt="" className="size-14 shrink-0 rounded-md border object-cover opacity-80" />
              ) : (
                <span aria-hidden="true" className="size-14 shrink-0 rounded-md border bg-muted" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="truncate text-xs font-medium text-muted-foreground" title={item.name}>
                  {item.name}
                </p>
                {issues ? <IssueList issues={issues} /> : <p className="text-sm">{item.error}</p>}
                {retryable && (
                  <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => onRetry(item.id)}>
                    <RotateCwIcon />
                    Try again
                  </Button>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 shrink-0"
                aria-label={`Dismiss ${item.name}`}
                onClick={() => onDismiss(item.id)}
              >
                <XIcon />
              </Button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">Photos that fail a check are never stored. Replace them with another photo.</p>
    </section>
  );
}
