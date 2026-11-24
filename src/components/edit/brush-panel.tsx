"use client";

import * as React from "react";
import { BrushIcon, LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CostHint } from "@/components/app/cost-hint";
import { api } from "@/lib/api-client";
import type { JobDTO, JobInput, MediaDTO } from "@/types/domain";
import { cn } from "@/lib/utils";
import type { MaskPainterHandle } from "./mask-painter";
import { BRUSH_PRESETS } from "./presets";
import { apiErrorText, submitJob } from "./use-session-jobs";

const MAX_PROMPT = 800;

export interface BrushPanelProps {
  media: MediaDTO;
  /** The mask painter shown in the preview area. */
  painter: React.RefObject<MaskPainterHandle | null>;
  /** Whether anything is painted (from MaskPainter.onPaintChange). */
  painted: boolean;
  onJobCreated: (job: JobDTO) => void;
}

/** Brush inpainting: export the painted mask → POST /api/uploads (mask) → POST /api/jobs (inpaint). */
export function BrushPanel({ media, painter, painted, onJobCreated }: BrushPanelProps) {
  const textareaId = React.useId();
  const presetsLabelId = React.useId();
  const [prompt, setPrompt] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const trimmed = prompt.trim();
  const valid = trimmed.length >= 2;
  const input: JobInput = { type: "inpaint", sourceMediaId: media.id, maskUploadId: "pending", prompt: trimmed || "edit" };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    try {
      const mask = await painter.current?.exportMask();
      if (!mask) {
        toast.error("Brush over the area you want to change first.");
        return;
      }
      const form = new FormData();
      form.append("file", new File([mask.blob], "mask.png", { type: "image/png" }));
      form.append("purpose", "mask");
      let uploadId: string;
      try {
        const res = await api<{ upload: { id: string } }>("/api/uploads", { method: "POST", body: form });
        uploadId = res.upload.id;
      } catch (err) {
        toast.error(apiErrorText(err));
        return;
      }
      const job = await submitJob({ type: "inpaint", sourceMediaId: media.id, maskUploadId: uploadId, prompt: trimmed });
      if (job) {
        onJobCreated(job);
        toast.success("Repainting the brushed area…");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Brush over the part of the photo to change, then describe what should be there. Everything outside the brushed
        area stays exactly the same.
      </p>

      <div className="flex flex-col gap-2">
        <p id={presetsLabelId} className="text-sm font-medium">
          Quick picks
        </p>
        <div role="group" aria-labelledby={presetsLabelId} className="flex flex-wrap gap-2">
          {BRUSH_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={prompt === preset.instruction}
              onClick={() => setPrompt(preset.instruction)}
              className={cn(
                "rounded-full",
                prompt === preset.instruction && "border-primary bg-brand-soft text-brand-soft-foreground",
              )}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={textareaId}>What should appear in the brushed area?</Label>
        <Textarea
          id={textareaId}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. a silver wristwatch"
          maxLength={MAX_PROMPT}
          rows={3}
          className="min-h-20"
        />
      </div>

      <div className="flex flex-col gap-3">
        <CostHint input={input} />
        {!painted && <p className="text-sm text-muted-foreground">Paint a mask on the photo to continue.</p>}
        <Button type="submit" variant="brand" size="lg" disabled={!valid || !painted || pending} className="w-full">
          {pending ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : <BrushIcon aria-hidden="true" />}
          {pending ? "Starting…" : "Repaint area"}
        </Button>
      </div>
    </form>
  );
}
