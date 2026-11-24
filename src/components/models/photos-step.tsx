"use client";

import * as React from "react";
import { ArrowRightIcon, CameraIcon, ShieldAlertIcon, SunIcon, UsersRoundIcon, XIcon } from "lucide-react";
import type { KeyedMutator } from "swr";

import { ImageDropzone } from "@/components/app/image-dropzone";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api-client";
import type { AddPhotoResponse, ModelDetailResponse } from "@/server/models/types";
import type { PhotoIssue } from "@/types/domain";
import { IssueList, TrainingPhotoGrid } from "./photo-grid";
import { rejectionIssues } from "./photo-issues";
import { ReadinessPanel } from "./readiness-panel";
import { modelKey, modelsApi } from "./use-model";

const GUIDE = [
  { icon: CameraIcon, text: "Recent photos of just you: close-ups and head-and-shoulders shots" },
  { icon: SunIcon, text: "Good light, sharp focus, different outfits, places and expressions" },
  { icon: UsersRoundIcon, text: "No group photos, sunglasses, filters or heavy edits" },
] as const;

interface NotSaved {
  key: string;
  name: string;
  issues: PhotoIssue[] | null;
  message: string;
}

export interface PhotosStepProps {
  modelId: string;
  detail: ModelDetailResponse;
  mutate: KeyedMutator<ModelDetailResponse>;
  /** Shows a Continue button (enabled once Instant mode is possible). */
  onContinue?: () => void;
}

/** Upload training photos with instant per-photo feedback and a live readiness panel. */
export function PhotosStep({ modelId, detail, mutate, onContinue }: PhotosStepProps) {
  const [notSaved, setNotSaved] = React.useState<NotSaved[]>([]);
  const { readinessByMode } = detail;
  const full = readinessByMode.trained.accepted >= readinessByMode.trained.maxAllowed;

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

  const onError = (err: Error, file: File) => {
    const issues = err instanceof ApiClientError ? rejectionIssues(err.details) : null;
    setNotSaved((prev) => [...prev, { key: `${file.name}-${prev.length}-${Date.now()}`, name: file.name, issues, message: err.message }]);
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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-5">
        <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
          {GUIDE.map(({ icon: Icon, text }) => (
            <li key={text} className="flex gap-2 rounded-lg bg-muted/50 p-3">
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              {text}
            </li>
          ))}
        </ul>

        <ImageDropzone<AddPhotoResponse>
          endpoint={`${modelKey(modelId)}/photos`}
          removeOnSuccess
          concurrency={2}
          disabled={full}
          title={full ? "Your training set is full" : "Add photos of yourself"}
          hint={full ? "Remove a photo to add another." : "Drop, paste or tap to choose. We check each one instantly."}
          onUploaded={onUploaded}
          onError={onError}
          onIdle={() => void mutate()}
        />

        {notSaved.length > 0 && (
          <section aria-labelledby="not-saved-title" className="flex flex-col gap-2 rounded-xl border border-destructive/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 id="not-saved-title" className="flex items-center gap-2 text-sm font-semibold">
                <ShieldAlertIcon aria-hidden="true" className="size-4 text-destructive" />
                {notSaved.length === 1 ? "1 photo wasn't saved" : `${notSaved.length} photos weren't saved`}
              </h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setNotSaved([])}>
                Clear
              </Button>
            </div>
            <ul className="flex flex-col gap-3">
              {notSaved.map((item) => (
                <li key={item.key} className="flex items-start gap-2 border-t pt-3 first:border-t-0 first:pt-0">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="truncate text-xs font-medium text-muted-foreground" title={item.name}>
                      {item.name}
                    </p>
                    {item.issues ? <IssueList issues={item.issues} /> : <p className="text-sm">{item.message}</p>}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 shrink-0"
                    aria-label={`Dismiss ${item.name}`}
                    onClick={() => setNotSaved((prev) => prev.filter((p) => p.key !== item.key))}
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Photos that fail a safety check are never stored.</p>
          </section>
        )}

        <TrainingPhotoGrid photos={detail.photos} onDelete={removePhoto} />
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20">
        <ReadinessPanel readiness={readinessByMode.trained} instant={readinessByMode.instant} />
        {onContinue && (
          <Button type="button" variant="brand" size="lg" onClick={onContinue} disabled={!readinessByMode.instant.canTrain}>
            Continue
            <ArrowRightIcon />
          </Button>
        )}
        {onContinue && !readinessByMode.instant.canTrain && (
          <p className="text-center text-xs text-muted-foreground">
            Add at least {readinessByMode.instant.minRequired} good photos to continue.
          </p>
        )}
      </div>
    </div>
  );
}
