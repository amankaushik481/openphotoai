/** Server-render smoke tests for the try-on UI (Next SSRs client components too). */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { pickResult, TryOnResult } from "@/components/try-on/try-on-result";
import { TryOnStudio } from "@/components/try-on/try-on-studio";
import type { GarmentUpload } from "@/components/try-on/types";
import type { JobDTO, MediaDTO } from "@/types/domain";

const media = (over: Partial<MediaDTO> = {}): MediaDTO => ({
  id: "med_person",
  kind: "image",
  url: "https://files.test/person.jpg",
  thumbUrl: "https://files.test/person-thumb.webp",
  downloadUrl: "https://files.test/person.jpg?dl=1",
  mimeType: "image/jpeg",
  width: 1024,
  height: 1280,
  durationSec: null,
  prompt: null,
  packId: null,
  modelId: "mdl_1",
  jobId: "job_src",
  parentMediaId: null,
  folderId: null,
  isDraft: false,
  isFavorite: false,
  hidden: false,
  watermarked: false,
  scores: null,
  createdAt: "2026-11-24T10:00:00.000Z",
  ...over,
});

const garment: GarmentUpload = { id: "upl_1", url: "https://files.test/garment.jpg", width: 800, height: 1000 };

const job = (over: Partial<JobDTO> = {}): JobDTO => ({
  id: "job_1",
  type: "try_on",
  status: "running",
  progress: 40,
  error: null,
  errorCode: null,
  creditsCharged: 3,
  creditsRefunded: 0,
  modelId: "mdl_1",
  packId: null,
  batchId: null,
  input: { type: "try_on", personMediaId: "med_person", garmentUploadId: "upl_1", category: "auto" },
  media: [],
  blockedCount: 0,
  createdAt: "2026-11-24T10:00:00.000Z",
  completedAt: null,
  ...over,
});

const result = media({ id: "med_result", url: "https://files.test/result.png", downloadUrl: "https://files.test/result.png?dl=1", parentMediaId: "med_person" });
const noop = vi.fn();
const renderResult = (j: JobDTO | undefined) =>
  renderToStaticMarkup(
    <TryOnResult job={j} person={media()} garment={garment} onTryAnother={noop} onRetry={noop} onCancel={noop} />,
  );

describe("TryOnStudio", () => {
  it("asks for a photo and a garment before running", () => {
    const html = renderToStaticMarkup(<TryOnStudio initialPerson={null} />);
    expect(html).toContain("Pick your photo");
    expect(html).toContain("Choose from your photos");
    expect(html).toContain("Drop a garment photo");
    expect(html).toContain("flat-lay or on-model product photo");
    expect(html).toContain("One-pieces");
    expect(html).toContain("Pick your photo and upload a garment to continue.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Try it on/);
    expect(html).toContain("3 credits");
  });

  it("preselects the photo from ?mediaId=", () => {
    const html = renderToStaticMarkup(<TryOnStudio initialPerson={media()} />);
    expect(html).toContain("https://files.test/person-thumb.webp");
    expect(html).toContain("Change photo");
    expect(html).toContain("Upload a garment to continue.");
  });

  it("explains an unknown ?mediaId=", () => {
    const html = renderToStaticMarkup(<TryOnStudio initialPerson={null} personNotFound />);
    expect(html).toContain("couldn&#x27;t find that photo");
  });
});

describe("TryOnResult", () => {
  it("shows person | garment | progress while running", () => {
    const html = renderResult(job());
    expect(html).toContain("Your photo");
    expect(html).toContain("Garment");
    expect(html).toContain("Usually ready in under a minute.");
    expect(html).toContain("Cancel");
    expect(html).not.toContain("Try another garment");
    expect(html).not.toContain("Download");
  });

  it("shows the result side by side with download and try-another actions", () => {
    const html = renderResult(job({ status: "succeeded", progress: 100, media: [result] }));
    expect(html).toContain("https://files.test/result.png");
    expect(html).toContain('href="https://files.test/result.png?dl=1"');
    expect(html).toContain("/app/gallery/med_result");
    expect(html).toContain("Try another garment");
    expect(html).not.toContain("refunded your credits");
  });

  it("explains a hidden low-likeness result", () => {
    const hidden = { ...result, hidden: true, scores: { likeness: 0.2, overall: 0.3 } };
    const html = renderResult(job({ status: "succeeded", media: [hidden], creditsRefunded: 3 }));
    expect(html).toContain("refunded your credits");
  });

  it("offers a retry when the job failed", () => {
    const html = renderResult(job({ status: "failed", error: "The AI provider couldn't finish this job.", errorCode: "provider_error", creditsRefunded: 3 }));
    expect(html).toContain("Try again");
    expect(html).toContain("Try another garment");
    expect(html).toContain("No result this time.");
  });

  it("pickResult prefers a visible output", () => {
    const hidden = { ...result, id: "med_hidden", hidden: true };
    expect(pickResult(undefined)).toBeNull();
    expect(pickResult(job({ status: "running", media: [result] }))).toBeNull();
    expect(pickResult(job({ status: "succeeded", media: [hidden, result] }))?.id).toBe("med_result");
    expect(pickResult(job({ status: "succeeded", media: [hidden] }))?.id).toBe("med_hidden");
  });
});
