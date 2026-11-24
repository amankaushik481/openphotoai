"use client";

import * as React from "react";
import { toast } from "sonner";
import { LoaderCircleIcon, MicIcon, ShieldCheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { CostHint } from "@/components/app/cost-hint";
import { useMe } from "@/hooks/use-me";
import type { JobDTO, MediaDTO } from "@/types/domain";
import { cn } from "@/lib/utils";
import { jobErrorText, postJob } from "./post-job";
import {
  buildTalkingVideoRequest,
  MAX_SCRIPT_CHARS,
  MAX_TALKING_SECONDS,
  MAX_TALKING_WORDS,
  scriptStats,
  VOICE_OPTIONS,
  VOICE_ORDER,
  type Voice,
} from "./video-options";

export interface TalkingVideoFormProps {
  source: MediaDTO | null;
  onChooseSource(): void;
  onCreated(job: JobDTO): void;
}

const GUIDELINES = [
  "Speak as yourself: intros, greetings, announcements, short explainers.",
  "No sexual content, hate, harassment, threats or violence.",
  "Don't pretend to be someone else or claim endorsements you don't have.",
  "No scams or misleading promises (giveaways, medical or financial claims).",
];

export function TalkingVideoForm({ source, onChooseSource, onCreated }: TalkingVideoFormProps) {
  const scriptId = React.useId();
  const voiceId = React.useId();
  const { mutate: refreshMe } = useMe();
  const [script, setScript] = React.useState("");
  const [voice, setVoice] = React.useState<Voice>("neutral");
  const [submitting, setSubmitting] = React.useState(false);

  const stats = scriptStats(script);
  const invalid = stats.tooShort || stats.tooLong;
  const request = buildTalkingVideoRequest({ sourceMediaId: source?.id ?? "", script, voice });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!source) return onChooseSource();
    if (invalid) return;
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
        <Label htmlFor={scriptId}>What should you say?</Label>
        <Textarea
          id={scriptId}
          value={script}
          onChange={(e) => setScript(e.target.value)}
          maxLength={MAX_SCRIPT_CHARS}
          rows={6}
          placeholder="Hi, I'm Sam — welcome to my channel! Every week I share one quick tip to make your mornings easier."
          aria-invalid={stats.tooLong || undefined}
          aria-describedby={`${scriptId}-stats`}
        />
        <div id={`${scriptId}-stats`} className="flex flex-col gap-1.5" aria-live="polite">
          <Progress
            value={Math.min(100, (stats.seconds / MAX_TALKING_SECONDS) * 100)}
            aria-label="Script length"
            className="h-1.5"
            indicatorClassName={cn(stats.tooLong && "bg-destructive")}
          />
          <p className={cn("text-xs tabular-nums", stats.tooLong ? "text-destructive" : "text-muted-foreground")}>
            {stats.words} {stats.words === 1 ? "word" : "words"} · about {stats.seconds}s of speech · max{" "}
            {MAX_TALKING_SECONDS}s
            {stats.tooLong && ` — trim it to about ${MAX_TALKING_WORDS} words`}
          </p>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend id={voiceId} className="mb-2 text-sm leading-none font-medium">
          Voice
        </legend>
        <RadioGroup
          value={voice}
          onValueChange={(v) => setVoice(v as Voice)}
          aria-labelledby={voiceId}
          className="grid gap-2 sm:grid-cols-2"
        >
          {VOICE_ORDER.map((v) => {
            const itemId = `${voiceId}-${v}`;
            return (
              <Label
                key={v}
                htmlFor={itemId}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-accent/50",
                  voice === v && "border-primary bg-brand-soft/40",
                )}
              >
                <RadioGroupItem value={v} id={itemId} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{VOICE_OPTIONS[v].label}</span>
                  <span className="text-xs text-muted-foreground">{VOICE_OPTIONS[v].description}</span>
                </span>
              </Label>
            );
          })}
        </RadioGroup>
      </fieldset>

      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <ShieldCheckIcon aria-hidden="true" className="size-4 text-primary" />
          What you can say
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          {GUIDELINES.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Every script is checked by our safety filter before you&apos;re charged. Talking videos can only be made from
          photos of you alone.
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <CostHint input={request} />
        <Button
          type="submit"
          variant="brand"
          size="lg"
          disabled={submitting || (Boolean(source) && invalid)}
          className="w-full sm:w-auto"
        >
          {submitting ? <LoaderCircleIcon className="animate-spin" /> : <MicIcon />}
          {!source ? "Choose a photo" : submitting ? "Starting…" : "Make talking video"}
        </Button>
      </div>
    </form>
  );
}
