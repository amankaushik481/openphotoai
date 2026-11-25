"use client";

import * as React from "react";
import Link from "next/link";
import { ImagesIcon, ShieldCheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MediaPicker } from "@/components/app/media-picker";
import { StepSection } from "@/components/try-on/step-section";
import type { MediaDTO } from "@/types/domain";
import { PRINT } from "@/components/edit/studio";
import { cn } from "@/lib/utils";

export interface PersonStepProps {
  person: MediaDTO | null;
  onChange: (person: MediaDTO) => void;
  disabled?: boolean;
}

/** Step 1: pick one of your OpenShoot photos (try-on never runs on uploaded photos of people). */
export function PersonStep({ person, onChange, disabled = false }: PersonStepProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <StepSection
      step={1}
      title="Pick your photo"
      description="Half- or full-body shots where the outfit is visible work best."
      done={Boolean(person)}
    >
      {person ? (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
          <div className={cn("relative aspect-[4/5] w-40 overflow-hidden sm:w-44", PRINT)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- private signed URLs must bypass the image optimizer */}
            <img src={person.thumbUrl || person.url} alt="Your selected photo" className="size-full object-cover" />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
            <ImagesIcon />
            Change photo
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
          <div aria-hidden="true" className="flex aspect-[4/5] w-40 items-end border border-dashed border-foreground/25 bg-muted/40 p-2 sm:w-44">
            <span className="mono-caps text-muted-foreground">No frame</span>
          </div>
          <div className="flex flex-col items-start gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={disabled}>
            <ImagesIcon />
            Choose from your photos
          </Button>
          <p className="text-xs text-muted-foreground">
            No photos yet?{" "}
            <Link href="/app/create" className="font-medium text-foreground underline underline-offset-4">
              Create some first
            </Link>
            .
          </p>
          </div>
        </div>
      )}
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheckIcon aria-hidden="true" className="mt-px size-4 shrink-0 text-safelight-ink" />
        For everyone&apos;s safety, try-on only works on photos we created of you.
      </p>

      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        kind="image"
        title="Pick your photo"
        description="Choose the photo of you to dress in the garment."
        onSelect={onChange}
      />
    </StepSection>
  );
}
