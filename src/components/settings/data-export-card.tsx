"use client";

import { DownloadIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/settings/editorial-card";
import { ApiClientError } from "@/lib/api-client";
import type { ApiErrorBody } from "@/types/domain";
import { apiErrorText } from "./client-errors";

const EXPORT_PATH = "/api/account/export";

function fileNameFrom(res: Response): string {
  const match = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "");
  return match?.[1] ?? "account-export.json";
}

async function downloadExport(): Promise<void> {
  let res: Response;
  try {
    res = await fetch(EXPORT_PATH, { cache: "no-store" });
  } catch {
    throw new ApiClientError("network", "", 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiClientError(body?.error.code ?? "internal", body?.error.message ?? "", res.status);
  }
  const url = URL.createObjectURL(await res.blob());
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileNameFrom(res);
    document.body.append(a);
    a.click();
    a.remove();
  } finally {
    // Give the browser a moment to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

export function DataExportCard() {
  const [pending, setPending] = useState(false);

  async function onDownload() {
    setPending(true);
    try {
      await downloadExport();
      toast.success("Your data export is downloading.");
    } catch (err) {
      toast.error(apiErrorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your data</CardTitle>
        <CardDescription>
          Download everything we store about you as a JSON file: profile, models, photos and videos, jobs, credits,
          payments and share links.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Photos, videos and selfies are included as download links that work for 24 hours.
        </p>
        <Button variant="outline" onClick={onDownload} disabled={pending} aria-busy={pending} className="shrink-0">
          {pending ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <DownloadIcon aria-hidden />}
          {pending ? "Preparing…" : "Download my data"}
        </Button>
      </CardContent>
    </Card>
  );
}
