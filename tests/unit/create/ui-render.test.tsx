/** Server-render smoke tests for the generation UI (Next SSRs these client components too). */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BatchProgressView } from "@/components/create/batch-progress";
import { CreateStudio } from "@/components/create/create-studio";
import { GenerationResult } from "@/components/create/generation-result";
import type { PackDetail } from "@/components/create/logic";
import { PackBrowser } from "@/components/create/pack-browser";
import { PackStudio } from "@/components/create/pack-studio";
import { generateJobInput, type JobDTO, type MediaDTO } from "@/types/domain";
import type { PackSummary } from "@/types/pack";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/app/create",
  useSearchParams: () => new URLSearchParams(),
}));

const summary: PackSummary = {
  slug: "linkedin-headshots",
  name: "LinkedIn Headshots",
  tagline: "Polished, approachable headshots",
  description: "Studio and office headshots that look like you on your best day.",
  category: "professional",
  emoji: "💼",
  tags: ["corporate"],
  colors: ["#123456", "#abcdef"],
  featured: true,
  isNew: false,
  promptCount: 14,
  sampleTitles: ["Studio grey", "Office window"],
};
const detail: PackDetail = {
  ...summary,
  defaultAspectRatio: "4:5",
  prompts: Array.from({ length: 14 }, (_, i) => ({ title: `Shot ${i + 1}` })),
};

function media(over: Partial<MediaDTO>): MediaDTO {
  return {
    id: "med_1",
    kind: "image",
    url: "https://x/1.jpg",
    thumbUrl: "https://x/1_t.jpg",
    downloadUrl: "https://x/1.jpg?dl=1",
    mimeType: "image/jpeg",
    width: 1024,
    height: 1280,
    durationSec: null,
    prompt: "portrait",
    packId: null,
    modelId: "mdl_1",
    jobId: "job_1",
    parentMediaId: null,
    folderId: null,
    isDraft: true,
    isFavorite: false,
    hidden: false,
    watermarked: false,
    scores: { overall: 0.5 },
    createdAt: "2026-11-24T10:00:00.000Z",
    ...over,
  };
}

const job: JobDTO = {
  id: "job_1",
  type: "generate",
  status: "succeeded",
  progress: 100,
  error: null,
  errorCode: null,
  creditsCharged: 0,
  creditsRefunded: 0,
  modelId: "mdl_1",
  packId: null,
  batchId: null,
  input: generateJobInput.parse({ type: "generate", modelId: "mdl_1", prompt: "portrait", quality: "draft", numImages: 3 }),
  media: [
    media({ id: "med_low", scores: { overall: 0.2 }, prompt: "low score shot" }),
    media({ id: "med_best", scores: { overall: 0.95 }, prompt: "best shot" }),
    media({ id: "med_hidden", hidden: true, scores: { overall: 0.1 }, prompt: "hidden shot" }),
  ],
  blockedCount: 0,
  createdAt: "2026-11-24T10:00:00.000Z",
  completedAt: "2026-11-24T10:00:05.000Z",
};

describe("CreateStudio", () => {
  it("renders mode tabs, prompt helper, quality with free drafts and a mobile action bar", () => {
    const html = renderToStaticMarkup(
      <CreateStudio packs={[summary]} modelModes={{}} drafts={{ limit: 30, remaining: 7 }} />,
    );
    for (const text of ["Prompt", "Pack", "Style reference", "Improve", "/1,500", "Draft", "Free · 7 left today", "Generate 4 drafts"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("Your photos will appear here");
    // Empty prompt: one-tap starters make the helper discoverable.
    expect(html).toContain("Try:");
    expect(html).toContain("Golden hour on a rooftop");
    expect(html).toContain("press Improve");
  });

  it("hides the starters once a prompt is filled in", () => {
    const html = renderToStaticMarkup(
      <CreateStudio packs={[summary]} modelModes={{}} drafts={{ limit: 30, remaining: 7 }} initial={{ prompt: "me in Paris" }} />,
    );
    expect(html).not.toContain("Golden hour on a rooftop");
  });

  it("prefills a pack deep link and falls back to Standard when no drafts are left", () => {
    const html = renderToStaticMarkup(
      <CreateStudio
        packs={[summary]}
        modelModes={{}}
        drafts={{ limit: 5, remaining: 0 }}
        initial={{ packId: "linkedin-headshots" }}
      />,
    );
    expect(html).toContain("None left today");
    expect(html).toContain("Generate 4 photos");
    expect(html).toContain("LinkedIn Headshots");
  });
});

describe("GenerationResult", () => {
  it("shows best shots first, folds hidden ones away and offers full quality for drafts", () => {
    const html = renderToStaticMarkup(
      <GenerationResult job={job} title="Drafts · portrait" modelModes={{ mdl_1: "instant" }} rerenders={{}} onFullQuality={() => {}} />,
    );
    expect(html.indexOf("best shot")).toBeLessThan(html.indexOf("low score shot"));
    expect(html).not.toContain("hidden shot");
    expect(html).toContain("Show 1 more");
    expect(html).toContain("Full quality");
    expect(html).toContain("(2 credits)"); // 1 standard image × instant multiplier
    expect(html).toContain('href="/app/edit/med_best"');
  });
});

describe("PackBrowser", () => {
  it("renders search, categories and in-app pack links", () => {
    const html = renderToStaticMarkup(<PackBrowser packs={[summary]} />);
    expect(html).toContain("Search packs");
    expect(html).toContain("Professional");
    expect(html).toContain('href="/app/packs/linkedin-headshots"');
  });
});

describe("PackStudio", () => {
  it("renders the hero, shot list, batch slider capped by plan and the cost summary", () => {
    const html = renderToStaticMarkup(
      <PackStudio pack={detail} modelModes={{}} drafts={{ limit: 5, remaining: 2 }} plan="free" />,
    );
    expect(html).toContain("LinkedIn Headshots");
    expect(html).toContain("Shot 1");
    expect(html).toContain("Show all 14 shots");
    expect(html).toContain('max="10"');
    expect(html).toContain("Generate 10 photos");
    expect(html).toContain("10 photos × 1 credit = 10 credits");
    expect(html).toContain("2 free drafts left today");
  });
});

describe("BatchProgressView", () => {
  it("renders a loading state before the first poll", () => {
    const html = renderToStaticMarkup(<BatchProgressView batchId="bat_1" pack={summary} />);
    expect(html).toContain('aria-busy="true"');
  });
});
