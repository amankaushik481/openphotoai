/** Server-render smoke tests for the video studio (Next SSRs client components too). */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaPicker } from "@/components/app/media-picker";
import { VideoJobCard } from "@/components/video/video-job-card";
import { VideoStudio } from "@/components/video/video-studio";
import type { JobDTO, MediaDTO } from "@/types/domain";

function dto(id: string, kind: MediaDTO["kind"] = "image"): MediaDTO {
  return {
    id,
    kind,
    url: `https://cdn.test/${id}.${kind === "video" ? "mp4" : "jpg"}`,
    thumbUrl: `https://cdn.test/${id}/thumb.webp`,
    downloadUrl: `https://cdn.test/${id}?dl=1`,
    mimeType: kind === "video" ? "video/mp4" : "image/jpeg",
    width: 720,
    height: 900,
    durationSec: kind === "video" ? 5 : null,
    prompt: "studio portrait",
    packId: null,
    modelId: "mdl_1",
    jobId: null,
    parentMediaId: null,
    folderId: null,
    isDraft: false,
    isFavorite: false,
    hidden: false,
    watermarked: false,
    scores: null,
    createdAt: "2026-11-24T00:00:00.000Z",
  };
}

function job(over: Partial<JobDTO>): JobDTO {
  return {
    id: "job_1",
    type: "video",
    status: "running",
    progress: 20,
    error: null,
    errorCode: null,
    creditsCharged: 10,
    creditsRefunded: 0,
    modelId: "mdl_1",
    packId: null,
    batchId: null,
    input: { type: "video", sourceMediaId: "med_src", durationSec: 5 },
    media: [],
    blockedCount: 0,
    createdAt: "2026-11-24T00:00:00.000Z",
    completedAt: null,
    ...over,
  };
}

describe("VideoStudio", () => {
  it("asks for a photo first", () => {
    const html = renderToStaticMarkup(<VideoStudio initialSource={null} initialTab="photo" />);
    expect(html).toContain("Start with a photo");
    expect(html).toContain("Photo to video");
    expect(html).toContain("Talking video");
    expect(html).toContain('href="/app/create"');
  });

  it("explains a missing ?mediaId photo", () => {
    const html = renderToStaticMarkup(<VideoStudio initialSource={null} initialTab="photo" sourceMissing />);
    expect(html).toContain("isn&#x27;t available anymore");
  });

  it("shows the chosen photo, motion presets and durations with cost", () => {
    const html = renderToStaticMarkup(<VideoStudio initialSource={dto("med_src")} initialTab="photo" />);
    expect(html).toContain("https://cdn.test/med_src.jpg");
    expect(html).toContain("Change photo");
    expect(html).toContain("Slow smile");
    expect(html).toContain("Hair in the wind");
    expect(html).toContain("Turn to camera");
    expect(html).toContain("10 seconds");
    expect(html).toContain("18 credits");
    expect(html).toContain("Make video");
  });

  it("renders the talking video form with voices and guidance", () => {
    const html = renderToStaticMarkup(<VideoStudio initialSource={dto("med_src")} initialTab="talking" />);
    expect(html).toContain("What should you say?");
    expect(html).toContain('maxLength="600"');
    expect(html).toContain("Deep (male)");
    expect(html).toContain("What you can say");
    expect(html).toContain("max 60s");
    expect(html).toContain("Make talking video");
  });
});

describe("VideoJobCard", () => {
  it("sets expectations while the video renders", () => {
    const html = renderToStaticMarkup(<VideoJobCard initialJob={job({})} />);
    expect(html).toContain("Videos usually take");
    expect(html).toContain('href="/app/gallery"');
    expect(html).toContain("Cancel");
  });

  it("plays and downloads the finished video", () => {
    const clip = dto("med_vid", "video");
    const html = renderToStaticMarkup(
      <VideoJobCard initialJob={job({ status: "succeeded", progress: 100, media: [clip] })} />,
    );
    expect(html).toMatch(/<video[^>]*controls/);
    expect(html).toContain("playsInline");
    expect(html).toContain(`poster="${clip.thumbUrl}"`);
    expect(html).toContain(`href="${clip.downloadUrl.replace("&", "&amp;")}"`);
    expect(html).toContain(`href="/app/gallery/${clip.id}"`);
  });

  it("labels talking videos with their script", () => {
    const html = renderToStaticMarkup(
      <VideoJobCard
        initialJob={job({ type: "talking_video", input: { type: "talking_video", sourceMediaId: "m", script: "Hello world", voice: "neutral" } })}
      />,
    );
    expect(html).toContain("Hello world");
  });
});

describe("MediaPicker", () => {
  it("renders nothing while closed", () => {
    const html = renderToStaticMarkup(<MediaPicker open={false} onOpenChange={() => {}} onSelect={() => {}} />);
    expect(html).toBe("");
  });
});
