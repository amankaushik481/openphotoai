"use client";

import * as React from "react";
import { LoaderCircleIcon, PersonStandingIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CostHint } from "@/components/app/cost-hint";
import { ImageDropzone } from "@/components/app/image-dropzone";
import { ModelPicker } from "@/components/app/model-picker";
import type { JobInput } from "@/types/domain";
import { CountPicker } from "./count-picker";
import { JobResults } from "./job-results";
import { POSE_COUNTS } from "./presets";
import { submitJob, useSessionJobs } from "./use-session-jobs";
import { LightTable, PRINT, STUDIO_LABEL, StudioPanel } from "./studio";

const MAX_PROMPT = 1500;

/** `upload` in the POST /api/uploads response. */
export interface UploadedReference {
  id: string;
  url: string;
  width: number;
  height: number;
}

/** Pose / style copy: pick a model, upload a reference photo, get yourself in that pose and setting. */
export function PoseStudio() {
  const promptId = React.useId();
  const [modelId, setModelId] = React.useState<string | null>(null);
  const [reference, setReference] = React.useState<UploadedReference | null>(null);
  const [prompt, setPrompt] = React.useState("");
  const [count, setCount] = React.useState<number>(2);
  const [pending, setPending] = React.useState(false);
  const { jobs, add } = useSessionJobs();

  const trimmed = prompt.trim();
  const ready = Boolean(modelId && reference) && !pending;
  const costInput: JobInput = {
    type: "pose_copy",
    modelId: modelId ?? "",
    referenceUploadId: reference?.id ?? "",
    numImages: count,
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelId || !reference || pending) return;
    setPending(true);
    const job = await submitJob({
      type: "pose_copy",
      modelId,
      referenceUploadId: reference.id,
      ...(trimmed ? { prompt: trimmed } : {}),
      numImages: count,
    });
    setPending(false);
    if (job) {
      add(job);
      toast.success(count === 1 ? "Copying the pose…" : `Creating ${count} photos in this pose…`);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:items-start">
        <section aria-label="Reference photo" className="flex flex-col gap-3">
          <LightTable className="flex flex-col gap-3">
            {reference ? (
              <>
                <div
                  className={cn("relative mx-auto w-full overflow-hidden", PRINT)}
                  style={{
                    aspectRatio: `${reference.width} / ${reference.height}`,
                    maxWidth: `calc(65dvh * ${reference.width / reference.height})`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
                  <img src={reference.url} alt="Your pose reference" className="size-full object-contain" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mx-auto"
                  onClick={() => setReference(null)}
                  disabled={pending}
                >
                  <RefreshCwIcon aria-hidden="true" />
                  Use a different photo
                </Button>
              </>
            ) : (
              <>
                <ImageDropzone<{ upload: UploadedReference }>
                  endpoint="/api/uploads"
                  extraFields={{ purpose: "reference" }}
                  multiple={false}
                  removeOnSuccess
                  title="Upload a pose reference"
                  hint="Any photo with one person in the pose, outfit style and setting you want."
                  onUploaded={(res) => setReference(res.upload)}
                />
                <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <PersonStandingIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-safelight-ink" />
                    Works best with one clearly visible person, head to waist or full body.
                  </li>
                  <li className="flex gap-2">
                    <ShieldCheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-safelight-ink" />
                    We copy the pose, framing and setting, never the other person&apos;s face. Photos of minors, public
                    figures or explicit content are rejected.
                  </li>
                </ul>
              </>
            )}
          </LightTable>
        </section>

        <form onSubmit={submit}>
          <StudioPanel kicker="Studio · pose copy" readout={reference ? "Reference loaded" : "No reference"}>
            <ModelPicker
              value={modelId}
              onValueChange={(id) => setModelId(id)}
              includeShared={false}
              disabled={pending}
            />

            <div className="flex flex-col gap-2">
              <Label htmlFor={promptId} className={STUDIO_LABEL}>
                Extra direction <span className="tracking-normal normal-case">(optional)</span>
              </Label>
              <Textarea
                id={promptId}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. wearing a charcoal suit, warmer evening light"
                maxLength={MAX_PROMPT}
                rows={3}
                className="min-h-20"
              />
            </div>

            <CountPicker value={count} onValueChange={setCount} options={POSE_COUNTS} disabled={pending} />

            <div className="flex flex-col gap-3">
              <CostHint input={costInput} />
              {!reference && <p className="text-sm text-muted-foreground">Upload a reference photo to continue.</p>}
              <Button type="submit" variant="brand" size="lg" disabled={!ready} className="w-full">
                {pending ? (
                  <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
                ) : (
                  <PersonStandingIcon aria-hidden="true" />
                )}
                {pending ? "Starting…" : "Copy this pose"}
              </Button>
            </div>
          </StudioPanel>
        </form>
      </div>

      <JobResults jobs={jobs} />
    </div>
  );
}
