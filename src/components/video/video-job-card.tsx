"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { DownloadIcon, ImagesIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { JobProgress, JobStatusBadge } from "@/components/app/job-progress";
import { useScriptCaptions } from "@/components/app/use-script-captions";
import { JOB_TYPE_LABELS } from "@/config/credits";
import { useJob } from "@/hooks/use-job";
import { useMe } from "@/hooks/use-me";
import type { JobDTO, MediaDTO } from "@/types/domain";
import { jobErrorText } from "./post-job";
import { FilmStrip } from "@/components/gallery/marks";

/** Shown while a video renders: they take minutes, and work continues server-side. */
export function VideoWaitNotice() {
  return (
    <p className="text-sm text-muted-foreground">
      Videos usually take 1–5 minutes. We&apos;ll keep working if you leave this page — you&apos;ll find it in your{" "}
      <Link href="/app/gallery" className="font-medium text-foreground underline underline-offset-4">
        gallery
      </Link>
      .
    </p>
  );
}

export function VideoPlayer({
  media,
  className,
  captionsScript,
  onError,
}: {
  media: MediaDTO;
  className?: string;
  /** Talking videos: the spoken script, shown as closed captions. */
  captionsScript?: string | null;
  /** The clip failed to load (e.g. its signed URL expired while the page stayed open). */
  onError?: () => void;
}) {
  const aspectRatio = media.width && media.height ? `${media.width} / ${media.height}` : undefined;
  const videoRef = React.useRef<HTMLVideoElement>(null);
  useScriptCaptions(videoRef, captionsScript, media.durationSec);
  return (
    <video
      ref={videoRef}
      controls
      playsInline
      preload="metadata"
      poster={media.thumbUrl}
      src={media.url}
      onError={onError}
      className={className ?? "max-h-[70dvh] w-full rounded-lg bg-black object-contain"}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      <a href={media.downloadUrl}>Download the video</a>
    </video>
  );
}

function jobTitle(job: JobDTO): string {
  if (job.input.type === "talking_video") {
    const script = job.input.script;
    return `${JOB_TYPE_LABELS.talking_video}: “${script.length > 60 ? `${script.slice(0, 57)}…` : script}”`;
  }
  if (job.input.type === "video") return `${JOB_TYPE_LABELS.video} · ${job.input.durationSec}s`;
  return JOB_TYPE_LABELS[job.type];
}

/** Progress -> player for one video job started on this page. */
export function VideoJobCard({ initialJob }: { initialJob: JobDTO }) {
  const { mutate: refreshMe } = useMe();
  const { job, cancel, mutate } = useJob(initialJob.id, {
    fallbackJob: initialJob,
    onTerminal: (done) => {
      if (done.status === "succeeded") toast.success("Your video is ready.");
      // Refunds (failure, cancel, safety block) change the balance.
      if (done.creditsRefunded > 0) void refreshMe();
    },
  });
  const [canceling, setCanceling] = React.useState(false);
  // Finished jobs aren't polled, so their signed URLs age with the tab: refetch once if the clip won't load.
  const refetched = React.useRef(false);
  const refreshUrls = () => {
    if (refetched.current) return;
    refetched.current = true;
    void mutate();
  };
  const current = job ?? initialJob;
  const video = current.media.find((m) => m.kind === "video");
  const inFlight = current.status === "queued" || current.status === "running";
  const title = jobTitle(current);

  const onCancel = async () => {
    setCanceling(true);
    try {
      await cancel();
    } catch (err) {
      toast.error(jobErrorText(err));
    } finally {
      setCanceling(false);
    }
  };

  if (current.status === "succeeded" && video) {
    return (
      <article className="flex flex-col gap-3 border border-foreground/15 bg-card p-3 sm:p-4" aria-label={title}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="truncate text-sm font-medium">{title}</h3>
          <JobStatusBadge status={current.status} />
        </div>
        <FilmStrip edge={`OpenShoot 400 · ▸ ${video.id.slice(-4).toUpperCase()}`}>
          <VideoPlayer
            media={video}
            captionsScript={current.input.type === "talking_video" ? current.input.script : null}
            onError={refreshUrls}
            className="max-h-[70dvh] w-full bg-black object-contain"
          />
        </FilmStrip>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="brand">
            <a href={video.downloadUrl} download>
              <DownloadIcon />
              Download
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/app/gallery/${video.id}`}>
              <ImagesIcon />
              Open in gallery
            </Link>
          </Button>
        </div>
      </article>
    );
  }

  return (
    <article className="flex flex-col gap-3 border border-foreground/15 bg-card p-3 sm:p-4" aria-label={title}>
      <JobProgress job={current} title={title} bare />
      {inFlight && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <VideoWaitNotice />
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={canceling} className="self-start sm:self-auto">
            <XIcon />
            {canceling ? "Canceling…" : "Cancel"}
          </Button>
        </div>
      )}
    </article>
  );
}
