"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckIcon, ClapperboardIcon, LoaderCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CostHint } from "@/components/app/cost-hint";
import { useMe } from "@/hooks/use-me";
import type { JobDTO, MediaDTO } from "@/types/domain";
import { cn } from "@/lib/utils";
import { jobErrorText, postJob } from "./post-job";
import {
  buildVideoRequest,
  DEFAULT_MOTION_PROMPT,
  hasPresetPhrase,
  MAX_MOTION_PROMPT_CHARS,
  MOTION_PRESETS,
  togglePresetPhrase,
  VIDEO_DURATIONS,
  videoCredits,
  type VideoDuration,
} from "./video-options";

export interface PhotoToVideoFormProps {
  source: MediaDTO | null;
  onChooseSource(): void;
  onCreated(job: JobDTO): void;
}

export function PhotoToVideoForm({ source, onChooseSource, onCreated }: PhotoToVideoFormProps) {
  const promptId = React.useId();
  const durationId = React.useId();
  const { mutate: refreshMe } = useMe();
  const [prompt, setPrompt] = React.useState("");
  const [duration, setDuration] = React.useState<VideoDuration>(5);
  const [submitting, setSubmitting] = React.useState(false);

  const request = buildVideoRequest({ sourceMediaId: source?.id ?? "", prompt, durationSec: duration });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!source) return onChooseSource();
    setSubmitting(true);
    try {
      const job = await postJob(request);
      onCreated(job);
      void refreshMe();
    } catch (err) {
      toast.error(jobErrorText(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={promptId}>How should it move?</Label>
        <Textarea
          id={promptId}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={MAX_MOTION_PROMPT_CHARS}
          rows={3}
          placeholder={`Optional — leave blank for “${DEFAULT_MOTION_PROMPT}”`}
          aria-describedby={`${promptId}-hint`}
        />
        <p id={`${promptId}-hint`} className="text-xs text-muted-foreground">
          Describe gentle movement and camera motion. Tap a preset to add it.
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="Motion presets">
          {MOTION_PRESETS.map((preset) => {
            const active = hasPresetPhrase(prompt, preset.phrase);
            return (
              <li key={preset.id}>
                <Button
                  type="button"
                  size="sm"
                  variant={active ? "secondary" : "outline"}
                  aria-pressed={active}
                  onClick={() => setPrompt((p) => togglePresetPhrase(p, preset.phrase))}
                  className={cn("rounded-full", active && "ring-1 ring-primary/40")}
                >
                  {active && <CheckIcon aria-hidden="true" />}
                  {preset.label}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <Label id={durationId}>Length</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          value={String(duration)}
          onValueChange={(v) => v && setDuration(Number(v) as VideoDuration)}
          aria-labelledby={durationId}
          className="w-full sm:w-fit"
        >
          {VIDEO_DURATIONS.map((d) => (
            <ToggleGroupItem key={d} value={String(d)} className="h-auto flex-col gap-0 px-5 py-2">
              <span className="font-medium">{d} seconds</span>
              <span className="text-xs text-muted-foreground">{videoCredits(d)} credits</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <CostHint input={request} />
        <Button type="submit" variant="brand" size="lg" disabled={submitting} className="w-full sm:w-auto">
          {submitting ? <LoaderCircleIcon className="animate-spin" /> : <ClapperboardIcon />}
          {!source ? "Choose a photo" : submitting ? "Starting…" : "Make video"}
        </Button>
      </div>
    </form>
  );
}
