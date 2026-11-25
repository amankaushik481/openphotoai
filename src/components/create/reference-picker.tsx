"use client";

import * as React from "react";
import { RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ImageDropzone } from "@/components/app/image-dropzone";
import { ApiErrorAlert } from "@/components/create/api-error-alert";
import { describeApiError, type FriendlyError } from "@/components/create/logic";

export interface ReferenceUpload {
  id: string;
  url: string;
  width: number;
  height: number;
}

const UPLOAD_FIELDS = { purpose: "reference" } as const;

/** Style/composition reference: upload (safety-checked server-side) → thumbnail with replace/remove. */
export function ReferencePicker({
  value,
  onValueChange,
}: {
  value: ReferenceUpload | null;
  onValueChange: (upload: ReferenceUpload | null) => void;
}) {
  const [error, setError] = React.useState<FriendlyError | null>(null);
  const labelId = React.useId();

  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={labelId}>
      <Label id={labelId}>Style reference</Label>
      {value ? (
        <div className="flex items-center gap-3 rounded-xs border border-foreground/15 bg-card p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
          <img
            src={value.url}
            alt="Your style reference"
            width={value.width}
            height={value.height}
            className="size-24 shrink-0 rounded-[1px] bg-muted object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              We borrow its composition, light and style — never the face of anyone in it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => onValueChange(null)}>
                <RefreshCwIcon />
                Use another photo
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <ImageDropzone<{ upload: ReferenceUpload }>
          endpoint="/api/uploads"
          extraFields={UPLOAD_FIELDS}
          multiple={false}
          compact
          removeOnSuccess
          title="Drop a reference photo"
          hint="Any pose, outfit or setting you like · JPEG, PNG, WebP or HEIC · paste works too"
          onUploaded={(res) => {
            setError(null);
            onValueChange(res.upload);
          }}
          onError={(err) => setError(describeApiError(err))}
        />
      )}
      <ApiErrorAlert error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
