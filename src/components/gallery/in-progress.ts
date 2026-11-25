/** Gallery "in progress" strip helpers (pure; unit-tested). */
import type { JobDTO } from "@/types/domain";

type JobLike = Pick<JobDTO, "id" | "type" | "status" | "progress" | "input">;

/** Jobs that will add media to the gallery and haven't finished (training makes a model, not media). */
export function inFlightMediaJobs<T extends Pick<JobDTO, "type" | "status">>(jobs: readonly T[]): T[] {
  return jobs.filter((j) => j.type !== "train" && (j.status === "queued" || j.status === "running"));
}

/** Outputs a job will produce (photos per job, or one clip). */
export function expectedOutputs(job: Pick<JobDTO, "input">): number {
  const input = job.input as { numImages?: unknown };
  return typeof input.numImages === "number" && input.numImages > 0 ? input.numImages : 1;
}

export interface InProgressSummary {
  jobs: number;
  photos: number;
  videos: number;
  /** Average progress of the in-flight jobs, 0–100. */
  percent: number;
}

const VIDEO_JOBS = new Set<JobDTO["type"]>(["video", "talking_video"]);

export function summarizeInProgress(jobs: readonly JobLike[]): InProgressSummary {
  const live = inFlightMediaJobs(jobs);
  let photos = 0;
  let videos = 0;
  for (const j of live) {
    if (VIDEO_JOBS.has(j.type)) videos += 1;
    else photos += expectedOutputs(j);
  }
  const percent = live.length
    ? Math.round(live.reduce((sum, j) => sum + Math.min(100, Math.max(0, j.progress || 0)), 0) / live.length)
    : 0;
  return { jobs: live.length, photos, videos, percent };
}

/** "Creating 4 photos and 1 video…" */
export function inProgressLabel(s: Pick<InProgressSummary, "photos" | "videos">): string {
  const parts: string[] = [];
  if (s.photos) parts.push(s.photos === 1 ? "1 photo" : `${s.photos} photos`);
  if (s.videos) parts.push(s.videos === 1 ? "1 video" : `${s.videos} videos`);
  return parts.length ? `Creating ${parts.join(" and ")}…` : "Finishing up…";
}

/** "2 credits refunded" note for a job that ended without (all of) its media. */
export function refundNote(job: Pick<JobDTO, "status" | "creditsRefunded">): string | null {
  if (job.creditsRefunded <= 0) return null;
  return job.creditsRefunded === 1 ? "1 credit refunded" : `${job.creditsRefunded} credits refunded`;
}
