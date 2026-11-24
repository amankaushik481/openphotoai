/** Server-render smoke tests for the editor + pose copy client components (Next SSRs them too). */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BeforeAfter } from "@/components/edit/before-after";
import { EditStudio } from "@/components/edit/edit-studio";
import { MaskPainter } from "@/components/edit/mask-painter";
import { PoseStudio } from "@/components/edit/pose-studio";
import { EDIT_PRESETS } from "@/components/edit/presets";
import type { MediaDTO } from "@/types/domain";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/app/edit/med_1" }));

const media: MediaDTO = {
  id: "med_1",
  kind: "image",
  url: "https://files.example/med_1.jpg",
  thumbUrl: "https://files.example/med_1_thumb.webp",
  downloadUrl: "https://files.example/med_1.jpg?dl=1",
  mimeType: "image/jpeg",
  width: 1024,
  height: 1280,
  durationSec: null,
  prompt: "studio portrait",
  packId: null,
  modelId: "mdl_1",
  jobId: "job_1",
  parentMediaId: null,
  folderId: null,
  isDraft: false,
  isFavorite: false,
  hidden: false,
  watermarked: false,
  scores: null,
  createdAt: "2026-01-02T03:04:05.000Z",
};

describe("EditStudio", () => {
  it("renders the preview, the three tabs and the edit form with presets and cost", () => {
    const html = renderToStaticMarkup(<EditStudio media={media} />);
    expect(html).toContain(media.url);
    for (const tab of ["Edit", "Brush", "Enhance"]) expect(html).toContain(`>${tab}</button>`);
    expect(html).toContain("Navy suit");
    expect(html).toContain("Apply edit");
    expect(html).toContain("2 credits");
  });

  it("opens on the brush tab with the mask painter", () => {
    const html = renderToStaticMarkup(<EditStudio media={media} initialTab="brush" />);
    expect(html).toContain('aria-roledescription="mask painter"');
    expect(html).toContain("Repaint area");
    expect(html).toContain("Brush size");
  });
});

describe("BeforeAfter", () => {
  it("is a keyboard-accessible slider over both photos", () => {
    const html = renderToStaticMarkup(<BeforeAfter beforeUrl="/a.jpg" afterUrl="/b.jpg" width={800} height={1000} />);
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("clip-path:inset(0 50% 0 0)");
    expect(html).toContain("aspect-ratio:800 / 1000");
  });
});

describe("MaskPainter", () => {
  it("renders an accessible painter with tools, history and zoom controls", () => {
    const html = renderToStaticMarkup(<MaskPainter imageUrl="/a.jpg" width={1024} height={1280} alt="photo" />);
    for (const label of ["Paint (B)", "Erase (E)", "Move (H)", "Undo", "Redo", "Clear mask", "Zoom in", "Zoom out"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain('width="1024"');
    expect(html).toContain('height="1280"');
  });
});

describe("PoseStudio", () => {
  it("asks for a reference photo before the pose can be copied", () => {
    const html = renderToStaticMarkup(<PoseStudio />);
    expect(html).toContain("Upload a pose reference");
    expect(html).toContain("Copy this pose");
    expect(html).toContain("Upload a reference photo to continue.");
  });
});

describe("presets", () => {
  it("ship the curated quick picks", () => {
    const labels = Object.values(EDIT_PRESETS).flatMap((p) => p.map((x) => x.label));
    for (const label of ["Navy suit", "Studio grey backdrop", "Short fade haircut", "Warm smile"]) expect(labels).toContain(label);
  });
});
