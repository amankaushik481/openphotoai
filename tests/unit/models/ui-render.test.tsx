/** Server-render smoke tests for the model UI (Next SSRs client components too). */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CameraCapture } from "@/components/models/camera-capture";
import { ModelDetail } from "@/components/models/model-detail";
import { ModelWizard } from "@/components/models/model-wizard";
import { ModelsList } from "@/components/models/models-list";
import { TrainingPhotoGrid } from "@/components/models/photo-grid";
import { ReadinessPanel } from "@/components/models/readiness-panel";
import { computeReadiness, computeReadinessByMode } from "@/server/models/readiness";
import type { ModelDetailResponse, ModelView } from "@/server/models/types";
import type { TrainingPhotoDTO } from "@/types/domain";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const model: ModelView = {
  id: "mdl_1",
  name: "Work me",
  subject: "woman",
  status: "collecting",
  mode: "trained",
  triggerWord: "ohwxabcdef",
  coverUrl: null,
  photoCount: 2,
  acceptedPhotoCount: 1,
  consentVerified: true,
  trainingJobId: null,
  shared: false,
  createdAt: "2026-11-01T00:00:00.000Z",
  trainedAt: null,
};

const photos: TrainingPhotoDTO[] = [
  {
    id: "tph_1",
    url: "http://x/1.jpg",
    thumbUrl: "http://x/1.webp",
    status: "accepted",
    quality: { score: 88, issues: [], metrics: { width: 1024, height: 1280, sharpness: 300, brightness: 130, contrast: 40, yaw: 1, pitch: 2 } },
    faceMatchScore: 0.97,
    createdAt: "2026-11-01T00:00:00.000Z",
  },
  {
    id: "tph_2",
    url: "http://x/2.jpg",
    thumbUrl: "http://x/2.webp",
    status: "rejected",
    quality: {
      score: 20,
      issues: [{ code: "blurry", severity: "error", message: "This photo is too blurry.", fix: "Hold the camera steady." }],
      metrics: { width: 1024, height: 1280, sharpness: 3, brightness: 130, contrast: 40 },
    },
    faceMatchScore: 0.96,
    createdAt: "2026-11-01T00:00:00.000Z",
  },
];

const rows = photos.map((p) => ({ status: p.status, quality: p.quality }));
const detail: ModelDetailResponse = {
  model,
  photos,
  readiness: computeReadiness(rows, { mode: "trained", consentVerified: true }),
  readinessByMode: computeReadinessByMode(rows, true),
};

describe("model UI", () => {
  it("starts the wizard with the name + subject step", () => {
    const html = renderToStaticMarkup(<ModelWizard />);
    expect(html).toContain("Create your model");
    expect(html).toContain("Model name");
    expect(html).toContain("Who is in the photos?");
    expect(html).toContain('aria-current="step"');
  });

  it("resumes the wizard at the photos step", () => {
    const html = renderToStaticMarkup(<ModelWizard initial={detail} />);
    expect(html).toContain("Add photos of yourself");
    expect(html).toContain("Training set");
    expect(html).toContain("Blurry");
  });

  it("offers a live camera only (no file input) for the consent selfie", () => {
    const html = renderToStaticMarkup(<CameraCapture onConfirm={async () => undefined} />);
    expect(html).toContain("Open camera");
    expect(html).not.toContain('type="file"');
  });

  it("renders the photo grid with status and issue chips", () => {
    const html = renderToStaticMarkup(<TrainingPhotoGrid photos={photos} onDelete={async () => undefined} />);
    expect(html).toContain("Photo 1: accepted");
    expect(html).toContain("Photo 2: can&#x27;t be used (Blurry)");
  });

  it("renders readiness blockers and the variety meter", () => {
    const html = renderToStaticMarkup(<ReadinessPanel readiness={detail.readiness} instant={detail.readinessByMode.instant} />);
    expect(html).toContain("Add 9 more good photos");
    expect(html).toContain("Facing camera: 1 of 4 suggested");
  });

  it("renders the model list and the detail page", () => {
    const list = renderToStaticMarkup(<ModelsList initialModels={[model, { ...model, id: "mdl_2", shared: true, ownerName: "Bea", status: "ready" }]} />);
    expect(list).toContain("Continue setup");
    expect(list).toContain("Shared with you");
    expect(list).toContain("Shared by Bea");
    expect(renderToStaticMarkup(<ModelsList initialModels={[]} />)).toContain("Create your first model");

    const page = renderToStaticMarkup(<ModelDetail initial={detail} />);
    expect(page).toContain("Work me");
    expect(page).toContain("Delete model");
    expect(page).toContain("Training photos");
  });
});
