"use client";

import * as React from "react";
import { ApertureIcon, FocusIcon, ImageIcon, LoaderCircleIcon, ScissorsIcon, ShirtIcon, SmileIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CostHint } from "@/components/app/cost-hint";
import { EDIT_KINDS, type JobDTO, type JobInput, type MediaDTO } from "@/types/domain";
import { cn } from "@/lib/utils";
import { CountPicker } from "./count-picker";
import { EDIT_COUNTS, EDIT_KIND_INFO, EDIT_PRESETS, type EditKind } from "./presets";
import { submitJob } from "./use-session-jobs";
import { STUDIO_CHIP, STUDIO_CHIP_ON, STUDIO_LABEL, STUDIO_TOGGLE } from "./studio";

const KIND_ICONS: Record<EditKind, typeof ShirtIcon> = {
  outfit: ShirtIcon,
  background: ImageIcon,
  hair: ScissorsIcon,
  expression: SmileIcon,
  custom: FocusIcon,
};

const MAX_INSTRUCTION = 800;
const EMPTY_INSTRUCTIONS: Record<EditKind, string> = {
  outfit: "",
  background: "",
  hair: "",
  expression: "",
  custom: "",
};

export interface EditPanelProps {
  media: MediaDTO;
  onJobCreated: (job: JobDTO) => void;
  disabled?: boolean;
}

/** Instruction edit: pick what to change (outfit, background, hair, expression, anything), a preset or free text. */
export function EditPanel({ media, onJobCreated, disabled = false }: EditPanelProps) {
  const textareaId = React.useId();
  const kindLabelId = React.useId();
  const presetsLabelId = React.useId();
  const [kind, setKind] = React.useState<EditKind>("outfit");
  const [instructions, setInstructions] = React.useState(EMPTY_INSTRUCTIONS);
  const [count, setCount] = React.useState<number>(1);
  const [pending, setPending] = React.useState(false);

  const instruction = instructions[kind];
  const trimmed = instruction.trim();
  const valid = trimmed.length >= 2;
  const info = EDIT_KIND_INFO[kind];
  const input: JobInput = {
    type: "edit",
    sourceMediaId: media.id,
    edit: kind,
    instruction: trimmed || "edit",
    numImages: count,
  };
  const setInstruction = (value: string) => setInstructions((prev) => ({ ...prev, [kind]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    const job = await submitJob({
      type: "edit",
      sourceMediaId: media.id,
      edit: kind,
      instruction: trimmed,
      numImages: count,
    });
    setPending(false);
    if (job) {
      onJobCreated(job);
      toast.success(count === 1 ? "Editing your photo…" : `Creating ${count} edits…`);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label id={kindLabelId} className={STUDIO_LABEL}>
          What to change
        </Label>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={kind}
          onValueChange={(v) => v && setKind(v as EditKind)}
          aria-labelledby={kindLabelId}
          className="w-full flex-wrap gap-2"
        >
          {EDIT_KINDS.map((k) => {
            const Icon = KIND_ICONS[k];
            return (
              <ToggleGroupItem
                key={k}
                value={k}
                className={cn("flex-none px-3 data-[variant=outline]:border-l", STUDIO_TOGGLE)}
              >
                <Icon aria-hidden="true" />
                {EDIT_KIND_INFO[k].label}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-2">
        <p id={presetsLabelId} className={STUDIO_LABEL}>
          Quick picks
        </p>
        <div role="group" aria-labelledby={presetsLabelId} className="flex flex-wrap gap-2">
          {EDIT_PRESETS[kind].map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={instruction === preset.instruction}
              onClick={() => setInstruction(preset.instruction)}
              className={cn(STUDIO_CHIP, instruction === preset.instruction && STUDIO_CHIP_ON)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={textareaId} className={STUDIO_LABEL}>
          {info.prompt}
        </Label>
        <Textarea
          id={textareaId}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={info.placeholder}
          maxLength={MAX_INSTRUCTION}
          rows={3}
          className="min-h-20"
        />
        <p className="text-xs text-muted-foreground">Your face and everything you don&apos;t mention stay the same.</p>
      </div>

      <CountPicker value={count} onValueChange={setCount} options={EDIT_COUNTS} label="Versions" disabled={pending} />

      <div className="flex flex-col gap-3">
        <CostHint input={input} />
        <Button type="submit" variant="brand" size="lg" disabled={!valid || pending || disabled} className="w-full">
          {pending ? (
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
          ) : (
            <ApertureIcon aria-hidden="true" />
          )}
          {pending ? "Starting…" : "Apply edit"}
        </Button>
      </div>
    </form>
  );
}
