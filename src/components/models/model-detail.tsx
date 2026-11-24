"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlertIcon, LoaderCircleIcon, LockIcon, PencilIcon, RotateCcwIcon, ScanFaceIcon, SparklesIcon, Trash2Icon } from "lucide-react";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { JobProgress } from "@/components/app/job-progress";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useJob } from "@/hooks/use-job";
import { ApiClientError } from "@/lib/api-client";
import type { ModelDetailResponse, ModelView } from "@/server/models/types";
import { ModeBadge, ModelStatusBadge } from "./model-status-badge";
import { TrainingPhotoGrid } from "./photo-grid";
import { ReadinessPanel } from "./readiness-panel";
import { modelsApi, useModel, useRefreshModels } from "./use-model";

export interface ModelDetailProps {
  initial: ModelDetailResponse;
}

/** One model: status, training progress / failure, photos, readiness, rename and real deletion. */
export function ModelDetail({ initial }: ModelDetailProps) {
  const router = useRouter();
  const refreshModels = useRefreshModels();
  const { detail, mutate } = useModel(initial.model.id, initial);
  const data = detail ?? initial;
  const { model } = data;
  const setupHref = `/app/models/new?id=${model.id}`;
  const inSetup = model.status === "awaiting_consent" || model.status === "collecting" || model.status === "failed";

  const removePhoto = async (photoId: string) => {
    await modelsApi.deletePhoto(model.id, photoId);
    await mutate();
  };

  const deleteModel = async () => {
    await modelsApi.remove(model.id);
    await refreshModels();
    toast.success(`"${model.name}" was deleted for good.`);
    router.push("/app/models");
  };

  return (
    <>
      <PageHeader
        back={{ href: "/app/models", label: "My models" }}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {model.name}
            {!model.shared && <RenameDialog model={model} onRenamed={(m) => void mutate((prev) => prev && { ...prev, model: m })} />}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ModelStatusBadge status={model.status} />
            {(model.status === "ready" || model.status === "training") && <ModeBadge mode={model.mode} />}
            {model.shared && <span>Shared with you by {model.ownerName || "a friend"}</span>}
          </span>
        }
        actions={
          <>
            {model.status === "ready" && (
              <Button asChild variant="brand">
                <Link href={model.shared ? "/app/together" : `/app/create?model=${model.id}`}>
                  <SparklesIcon />
                  {model.shared ? "Together photos" : "Create photos"}
                </Link>
              </Button>
            )}
            {inSetup && !model.shared && (
              <Button asChild variant="brand">
                <Link href={setupHref}>
                  <ScanFaceIcon />
                  Continue setup
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-8">
        {model.status === "training" && model.trainingJobId && <TrainingCard jobId={model.trainingJobId} onDone={() => void mutate()} />}
        {model.status !== "training" && !model.shared && inSetup && model.trainingJobId && (
          <LastTrainingFailure jobId={model.trainingJobId} retryHref={setupHref} />
        )}

        {model.shared ? (
          <Alert variant="brand">
            <LockIcon aria-hidden="true" />
            <AlertTitle>Shared with you</AlertTitle>
            <AlertDescription>
              <p>
                {model.ownerName || "Your friend"} accepted your invite, so you can use this model in Together photos. Their
                photos stay private, and they can stop sharing at any time.
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <section aria-labelledby="photos-title" className="flex min-w-0 flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="photos-title" className="text-lg font-semibold">
                  Training photos
                </h2>
                <p className="text-sm text-muted-foreground">Private · delete any time</p>
              </div>
              {data.photos.length > 0 ? (
                <TrainingPhotoGrid photos={data.photos} onDelete={removePhoto} />
              ) : (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No training photos.{" "}
                  {inSetup && (
                    <Link href={setupHref} className="font-medium text-foreground underline underline-offset-4">
                      Add some
                    </Link>
                  )}
                </p>
              )}
              {model.status === "ready" && model.mode === "trained" && data.photos.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Your trained model no longer needs these photos. Removing them doesn&apos;t change the model.
                </p>
              )}
              {model.status === "ready" && model.mode === "instant" && (
                <p className="text-xs text-muted-foreground">
                  Instant models use your best photos as references, so keep at least {data.readinessByMode.instant.minRequired}.
                </p>
              )}
            </section>
            <ReadinessPanel readiness={data.readiness} />
          </div>
        )}

        {!model.shared && (
          <section aria-labelledby="danger-title" className="flex flex-col gap-3 rounded-xl border border-destructive/30 p-4 sm:p-5">
            <h2 id="danger-title" className="font-semibold">
              Delete this model
            </h2>
            <p className="text-sm text-muted-foreground">
              Permanently deletes the model, its trained weights at our AI provider, your consent selfie and every training
              photo. Photos you already created stay in your gallery. We&apos;ll email you a confirmation.
            </p>
            <ConfirmDialog
              destructive
              title={`Delete "${model.name}" for good?`}
              description="This is real deletion, not an archive: the trained model, your consent selfie and all training photos are erased from our storage and from the AI provider. Any training in progress is canceled and refunded. This can't be undone."
              confirmLabel="Delete forever"
              onConfirm={deleteModel}
              trigger={
                <Button type="button" variant="outline" className="w-fit border-destructive/40 text-destructive hover:bg-destructive/10">
                  <Trash2Icon />
                  Delete model
                </Button>
              }
            />
          </section>
        )}
      </div>
    </>
  );
}

function TrainingCard({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const { job } = useJob(jobId, { onTerminal: onDone });
  return (
    <div className="flex flex-col gap-2">
      <JobProgress job={job} title="Training your model (about 20 minutes)" />
      <p className="text-sm text-muted-foreground">You can leave this page. We&apos;ll email you when it&apos;s ready.</p>
    </div>
  );
}

function LastTrainingFailure({ jobId, retryHref }: { jobId: string; retryHref: string }) {
  const { job } = useJob(jobId);
  if (!job || !["failed", "canceled", "blocked"].includes(job.status)) return null;
  return (
    <Alert variant="warning">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{job.status === "canceled" ? "Training was canceled" : "Training didn't finish"}</AlertTitle>
      <AlertDescription>
        <p>
          {job.creditsRefunded > 0 ? `Your ${job.creditsRefunded} credits were refunded. ` : ""}
          Check your photos and try again, or choose an Instant model.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-1">
          <Link href={retryHref}>
            <RotateCcwIcon />
            Try again
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function RenameDialog({ model, onRenamed }: { model: ModelView; onRenamed: (model: ModelView) => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(model.name);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputId = React.useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await modelsApi.rename(model.id, name.trim());
      onRenamed(res.model);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't rename the model.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(model.name);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Rename model">
          <PencilIcon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Rename model</DialogTitle>
            <DialogDescription>Only you see this name.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId}>Name</Label>
            <Input id={inputId} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim() || name.trim() === model.name}>
              {pending && <LoaderCircleIcon className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
