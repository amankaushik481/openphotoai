"use client";

import * as React from "react";
import { LightbulbIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImageDropzone } from "@/components/app/image-dropzone";
import { StepSection } from "@/components/try-on/step-section";
import { GARMENT_TIPS, type GarmentUpload, type UploadResponse } from "@/components/try-on/types";
import { PRINT } from "@/components/edit/studio";
import { cn } from "@/lib/utils";

export interface GarmentStepProps {
  garment: GarmentUpload | null;
  onUploaded: (garment: GarmentUpload) => void;
  onClear: () => void;
  disabled?: boolean;
  ref?: React.Ref<HTMLElement>;
}

/** Step 2: upload the garment photo (POST /api/uploads, purpose "garment" — safety-checked server-side). */
export function GarmentStep({ garment, onUploaded, onClear, disabled = false, ref }: GarmentStepProps) {
  return (
    <StepSection
      ref={ref}
      step={2}
      title="Upload the garment"
      description="A product photo of the piece you want to try on."
      done={Boolean(garment)}
    >
      {garment ? (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
          <div className={cn("relative aspect-[4/5] w-40 overflow-hidden sm:w-44", PRINT)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- private signed URLs must bypass the image optimizer */}
            <img src={garment.url} alt="Your garment photo" className="size-full object-contain" />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClear} disabled={disabled}>
            <RefreshCwIcon />
            Use a different garment
          </Button>
        </div>
      ) : (
        <ImageDropzone<UploadResponse>
          endpoint="/api/uploads"
          extraFields={{ purpose: "garment" }}
          multiple={false}
          removeOnSuccess
          compact
          disabled={disabled}
          title="Drop a garment photo"
          hint="JPEG, PNG, WebP or HEIC — or paste an image"
          onUploaded={(res) => onUploaded(res.upload)}
        />
      )}

      <div className="border-l-2 border-foreground/30 bg-muted/50 p-3">
        <p className="mono-caps mb-1.5 flex items-center gap-1.5 text-muted-foreground">
          <LightbulbIcon aria-hidden="true" className="size-3.5" />
          Tips for a great result
        </p>
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
          {GARMENT_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>
    </StepSection>
  );
}
