/** Server-render smoke tests for the enhance UI (Next SSRs client components too). */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EnhancePanel, EnhanceQuickActions } from "@/components/enhance/enhance-panel";
import { EnhanceResult } from "@/components/enhance/enhance-result";
import type { MediaDTO } from "@/types/domain";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const media = (over: Partial<MediaDTO> = {}): MediaDTO => ({
  id: "med_src",
  kind: "image",
  url: "https://files.test/src.jpg",
  thumbUrl: "https://files.test/src-thumb.webp",
  downloadUrl: "https://files.test/src.jpg?dl=1",
  mimeType: "image/jpeg",
  width: 1024,
  height: 1280,
  durationSec: null,
  prompt: "studio portrait",
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

const buttonWith = (label: string) => new RegExp(`<button(?:(?!</button>).)*${label}`);
const disabledButtonWith = (label: string) => new RegExp(`<button[^>]*disabled=""[^>]*>(?:(?!</button>).)*${label}`);

describe("EnhancePanel", () => {
  it("shows the three tools with options, target resolution and costs", () => {
    const html = renderToStaticMarkup(<EnhancePanel media={media()} />);
    expect(html).toContain("Upscale");
    expect(html).toContain("Face restore");
    expect(html).toContain("Remove background");
    expect(html).toContain("Restore face");
    expect(html).toContain("1024 × 1280");
    expect(html).toContain("2048 × 2560");
    expect(html).toContain("5.2 MP");
    expect(html).toContain("Costs 2 credits");
    expect(html).toContain("Costs 1 credit");
    expect(html).toMatch(buttonWith("Upscale 2×"));
    expect(html).not.toMatch(disabledButtonWith("Upscale 2×"));
    expect(html).not.toContain("Draft preview");
  });

  it("disables everything for videos", () => {
    const html = renderToStaticMarkup(<EnhancePanel media={media({ kind: "video", mimeType: "video/mp4" })} />);
    expect(html).toContain("Photos only");
    expect(html).toMatch(disabledButtonWith("Upscale 2×"));
    expect(html).toMatch(disabledButtonWith("Restore face"));
    expect(html).toMatch(disabledButtonWith("Remove background"));
    expect(html).not.toContain("Costs");
  });

  it("warns about drafts, explains size limits and blocks re-removing a transparent background", () => {
    const draft = renderToStaticMarkup(<EnhancePanel media={media({ isDraft: true })} />);
    expect(draft).toContain("Draft preview");

    const big = renderToStaticMarkup(<EnhancePanel media={media({ width: 4096, height: 3000 })} />);
    expect(big).toContain("already high resolution");
    expect(big).toMatch(disabledButtonWith("Upscale 2×"));

    const png = renderToStaticMarkup(<EnhancePanel media={media({ mimeType: "image/png" })} />);
    expect(png).toContain("already has a transparent background");
    expect(png).toMatch(disabledButtonWith("Remove background"));
  });
});

describe("EnhanceQuickActions", () => {
  it("renders labelled icon buttons with costs", () => {
    const html = renderToStaticMarkup(<EnhanceQuickActions media={media()} />);
    expect(html).toContain('aria-label="Quick enhancements"');
    expect(html).toContain('aria-label="Upscale 2× (2 credits)"');
    expect(html).toContain('aria-label="Restore face (1 credit)"');
    expect(html).toContain('aria-label="Remove background (1 credit)"');
    expect(html).not.toContain('aria-disabled="true"');
  });

  it("marks actions unavailable for videos", () => {
    const html = renderToStaticMarkup(<EnhanceQuickActions media={media({ kind: "video", mimeType: "video/mp4" })} />);
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(3);
    expect(html).toContain("Enhancements work on photos only");
  });
});

describe("EnhanceResult", () => {
  it("shows transparent PNGs on a checkerboard with download + open links", () => {
    const html = renderToStaticMarkup(
      <EnhanceResult media={media({ id: "med_out", mimeType: "image/png", width: 640, height: 800 })} alt="Cut out" />,
    );
    expect(html).toContain("repeating-conic-gradient");
    expect(html).toContain("Transparent PNG");
    expect(html).toContain("640 × 800");
    expect(html).toContain('href="https://files.test/src.jpg?dl=1"');
    expect(html).toContain('href="/app/gallery/med_out"');
  });

  it("uses a plain backdrop for opaque photos", () => {
    const html = renderToStaticMarkup(<EnhanceResult media={media()} alt="Upscaled" />);
    expect(html).not.toContain("repeating-conic-gradient");
    expect(html).not.toContain("Transparent PNG");
  });
});
