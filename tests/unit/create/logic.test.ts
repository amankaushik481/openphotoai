import { describe, expect, it } from "vitest";
import {
  PROMPT_MAX_LENGTH,
  appendToPrompt,
  batchAnnouncement,
  batchCost,
  batchPresets,
  batchProgress,
  buildGenerateRequest,
  clampBatchSize,
  classifySuggestion,
  collectJobMedia,
  costBreakdown,
  describeApiError,
  draftDailyLimit,
  expectedImages,
  filenameFromDisposition,
  filterPacks,
  formatWait,
  fullQualityRequest,
  generateCost,
  isPackCategory,
  jobAnnouncement,
  newIdempotencyKey,
  packCategoriesIn,
  parseSeed,
  pushHistory,
  modelModesFrom,
  resolveIdentityMode,
  sortBestShots,
  splitBestShots,
  type CreateFormState,
} from "@/components/create/logic";
import { creditCost, DRAFT_DAILY_LIMIT, DRAFT_DAILY_LIMIT_FREE, INSTANT_MODE_MULTIPLIER } from "@/config/credits";
import { ApiClientError } from "@/lib/api-client";
import {
  API_ERROR_CODES,
  createBatchRequest,
  createJobRequest,
  generateJobInput,
  QUALITY_LEVELS,
  type JobDTO,
  type MediaDTO,
} from "@/types/domain";
import type { PackSummary } from "@/types/pack";

function media(over: Partial<MediaDTO> = {}): MediaDTO {
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
    prompt: "p",
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
    createdAt: "2026-11-24T10:00:00.000Z",
    ...over,
  };
}

function job(over: Partial<JobDTO> = {}): JobDTO {
  return {
    id: "job_1",
    type: "generate",
    status: "running",
    progress: 40,
    error: null,
    errorCode: null,
    creditsCharged: 4,
    creditsRefunded: 0,
    modelId: "mdl_1",
    packId: null,
    batchId: null,
    input: generateJobInput.parse({ type: "generate", modelId: "mdl_1", prompt: "x", numImages: 3 }),
    media: [],
    blockedCount: 0,
    createdAt: "2026-11-24T10:00:00.000Z",
    completedAt: null,
    ...over,
  };
}

const baseForm: CreateFormState = {
  mode: "prompt",
  modelId: "mdl_1",
  prompt: "me on a yacht at sunset",
  packId: null,
  packPromptIndex: null,
  referenceUploadId: null,
  aspectRatio: "4:5",
  numImages: 4,
  quality: "draft",
  seed: "",
  brandKitId: null,
};

describe("cost calculation (mirrors creditCost × instant multiplier)", () => {
  it("matches creditCost for every quality, count and draft re-render", () => {
    for (const quality of QUALITY_LEVELS) {
      for (const numImages of [1, 2, 3, 4]) {
        const input = generateJobInput.parse({ type: "generate", modelId: "m", prompt: "x", quality, numImages });
        expect(generateCost({ quality, numImages })).toBe(creditCost(input));
        expect(generateCost({ quality, numImages, mode: "trained" })).toBe(creditCost(input));
        expect(generateCost({ quality, numImages, mode: "instant" })).toBe(creditCost(input) * INSTANT_MODE_MULTIPLIER);
      }
    }
    const rerender = generateJobInput.parse({ type: "generate", modelId: "m", fromDraftMediaId: "med", quality: "standard" });
    expect(generateCost({ quality: "standard", numImages: 4, fromDraft: true })).toBe(creditCost(rerender));
    expect(generateCost({ quality: "high", numImages: 4, fromDraft: true, mode: "instant" })).toBe(2 * INSTANT_MODE_MULTIPLIER);
  });

  it("keeps drafts free even on instant models", () => {
    expect(generateCost({ quality: "draft", numImages: 4, mode: "instant" })).toBe(0);
  });

  it("clamps image counts to 1..4", () => {
    expect(generateCost({ quality: "standard", numImages: 9 })).toBe(4);
    expect(generateCost({ quality: "standard", numImages: 0 })).toBe(1);
    expect(generateCost({ quality: "standard", numImages: Number.NaN })).toBe(1);
  });

  it("prices a batch as count one-image jobs", () => {
    for (const quality of ["standard", "high"] as const) {
      const one = creditCost(generateJobInput.parse({ type: "generate", modelId: "m", packId: "p", quality, numImages: 1 }));
      expect(batchCost({ count: 25, quality })).toBe(25 * one);
      expect(batchCost({ count: 25, quality, mode: "instant" })).toBe(25 * one * INSTANT_MODE_MULTIPLIER);
    }
    expect(batchCost({ count: 0, quality: "standard" })).toBe(0);
  });

  it("explains the batch price", () => {
    expect(costBreakdown({ count: 10, quality: "standard" })).toBe("10 photos × 1 credit = 10 credits");
    expect(costBreakdown({ count: 10, quality: "high", mode: "instant" })).toBe(
      `10 photos × 2 credits × ${INSTANT_MODE_MULTIPLIER} (instant model) = ${10 * 2 * INSTANT_MODE_MULTIPLIER} credits`,
    );
    expect(costBreakdown({ count: 1, quality: "standard" })).toBe("1 photo × 1 credit = 1 credit");
  });

  it("knows the daily draft allowance and plan batch sizes", () => {
    expect(draftDailyLimit(true)).toBe(DRAFT_DAILY_LIMIT);
    expect(draftDailyLimit(false)).toBe(DRAFT_DAILY_LIMIT_FREE);
    expect(clampBatchSize(50, "free")).toBe(10);
    expect(clampBatchSize(50, "pro")).toBe(50);
    expect(clampBatchSize(-3, "pro")).toBe(1);
    expect(batchPresets("free")).toEqual([5, 10]);
    expect(batchPresets("starter")).toEqual([5, 10, 25]);
    expect(batchPresets("studio")).toEqual([5, 10, 25, 50]);
    for (const n of batchPresets("pro")) expect(() => createBatchRequest.parse({ modelId: "m", packId: "p", count: n })).not.toThrow();
  });
});

describe("resolveIdentityMode", () => {
  it("prefers an explicit DTO mode, then the server map, then the training-job heuristic", () => {
    expect(resolveIdentityMode({ id: "a", mode: "instant" }, { a: "trained" })).toBe("instant");
    expect(resolveIdentityMode({ id: "a" }, { a: "instant" })).toBe("instant");
    expect(resolveIdentityMode({ id: "b", status: "ready", trainingJobId: null }, {})).toBe("instant");
    expect(resolveIdentityMode({ id: "b", status: "ready", trainingJobId: "job_x" }, {})).toBe("trained");
    expect(resolveIdentityMode({ id: "c", status: "training", trainingJobId: null })).toBeUndefined();
    expect(resolveIdentityMode(null)).toBeUndefined();
  });
});

describe("buildGenerateRequest", () => {
  it("builds valid POST /api/jobs bodies for each mode", () => {
    const prompt = buildGenerateRequest(baseForm);
    expect(prompt).toEqual({
      ok: true,
      body: { type: "generate", modelId: "mdl_1", quality: "draft", numImages: 4, aspectRatio: "4:5", prompt: "me on a yacht at sunset" },
    });

    const pack = buildGenerateRequest({ ...baseForm, mode: "pack", packId: "linkedin-headshots", packPromptIndex: 2, prompt: "  " });
    expect(pack.ok && pack.body).toMatchObject({ packId: "linkedin-headshots", packPromptIndex: 2 });
    expect(pack.ok && "prompt" in pack.body).toBe(false);

    const ref = buildGenerateRequest({
      ...baseForm,
      mode: "reference",
      referenceUploadId: "upl_1",
      seed: "42",
      brandKitId: "bk_1",
      quality: "high",
    });
    expect(ref.ok && ref.body).toMatchObject({ referenceUploadId: "upl_1", seed: 42, brandKitId: "bk_1", quality: "high" });

    for (const r of [prompt, pack, ref]) {
      if (!r.ok) throw new Error(r.message);
      expect(() => createJobRequest.parse(r.body)).not.toThrow();
    }
  });

  it("does not send pack or reference fields from other tabs", () => {
    const r = buildGenerateRequest({ ...baseForm, packId: "x", referenceUploadId: "upl_1" });
    expect(r.ok && r.body).not.toHaveProperty("packId");
    expect(r.ok && r.body).not.toHaveProperty("referenceUploadId");
  });

  it("explains what is missing", () => {
    expect(buildGenerateRequest({ ...baseForm, modelId: null })).toMatchObject({ ok: false, message: expect.stringMatching(/model/i) });
    expect(buildGenerateRequest({ ...baseForm, prompt: "  " })).toMatchObject({ ok: false });
    expect(buildGenerateRequest({ ...baseForm, mode: "pack" })).toMatchObject({ ok: false, message: expect.stringMatching(/pack/i) });
    expect(buildGenerateRequest({ ...baseForm, mode: "reference" })).toMatchObject({ ok: false, message: expect.stringMatching(/reference/i) });
    expect(buildGenerateRequest({ ...baseForm, mode: "reference", referenceUploadId: "u", prompt: "" })).toMatchObject({ ok: false });
    expect(buildGenerateRequest({ ...baseForm, prompt: "x".repeat(PROMPT_MAX_LENGTH + 1) })).toMatchObject({ ok: false });
    expect(buildGenerateRequest({ ...baseForm, seed: "12a" })).toMatchObject({ ok: false, message: expect.stringMatching(/seed/i) });
  });

  it("parses seeds", () => {
    expect(parseSeed("")).toBeNull();
    expect(parseSeed(" 7 ")).toBe(7);
    expect(parseSeed("2147483647")).toBe(2_147_483_647);
    expect(parseSeed("2147483648")).toBe("invalid");
    expect(parseSeed("-1")).toBe("invalid");
    expect(parseSeed("1.5")).toBe("invalid");
  });

  it("builds a valid full-quality re-render of a draft", () => {
    const body = fullQualityRequest(media({ id: "med_d", isDraft: true }), "mdl_fallback");
    expect(body).toEqual({ type: "generate", modelId: "mdl_1", fromDraftMediaId: "med_d", quality: "standard", numImages: 1 });
    expect(() => createJobRequest.parse(body)).not.toThrow();
    expect(fullQualityRequest(media({ modelId: null }), "mdl_fb")?.modelId).toBe("mdl_fb");
    expect(fullQualityRequest(media({ modelId: null }), null)).toBeNull();
  });

  it("makes a fresh uuid-shaped idempotency key per click", () => {
    const keys = new Set(Array.from({ length: 50 }, newIdempotencyKey));
    expect(keys.size).toBe(50);
    for (const k of keys) expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("prompt helper suggestions", () => {
  it("appends quoted examples, replaces with prompt-shaped suggestions, and keeps other tips as hints", () => {
    expect(classifySuggestion('Describe the outfit, e.g. "wearing a navy linen shirt".')).toEqual({
      kind: "append",
      text: "wearing a navy linen shirt",
      label: "+ wearing a navy linen shirt",
    });
    expect(classifySuggestion("Pick the light, e.g. “golden hour”")).toMatchObject({ kind: "append", text: "golden hour" });
    const alt = classifySuggestion(
      "professional photo of a person on a yacht, shot on an 85mm lens, soft golden-hour sunlight, rule-of-thirds composition",
    );
    expect(alt.kind).toBe("replace");
    expect(alt.label.length).toBeLessThanOrEqual(60);
    expect(classifySuggestion("photo of {subject}")).toMatchObject({ kind: "replace" });
    expect(classifySuggestion("Add a time of day")).toEqual({ kind: "tip", text: "Add a time of day", label: "Add a time of day" });
  });

  it("appends phrases cleanly", () => {
    expect(appendToPrompt("on a yacht, ", "golden hour")).toBe("on a yacht, golden hour");
    expect(appendToPrompt("", "golden hour")).toBe("golden hour");
    expect(appendToPrompt("at Golden Hour", "golden hour")).toBe("at Golden Hour");
    expect(appendToPrompt("on a yacht.", "  ")).toBe("on a yacht");
  });

  it("keeps a bounded undo stack without consecutive duplicates", () => {
    expect(pushHistory(["a"], "a")).toEqual(["a"]);
    expect(pushHistory(["a"], "b")).toEqual(["a", "b"]);
    expect(pushHistory(["1", "2", "3"], "4", 3)).toEqual(["2", "3", "4"]);
  });
});

describe("best shots", () => {
  const a = media({ id: "a", scores: { overall: 0.5 }, createdAt: "2026-01-01T00:00:01.000Z" });
  const b = media({ id: "b", scores: { overall: 0.9 } });
  const c = media({ id: "c", scores: { overall: 0.99 }, hidden: true });
  const d = media({ id: "d", scores: null, createdAt: "2026-01-01T00:00:00.000Z" });
  const e = media({ id: "e", scores: { overall: 0.5 }, createdAt: "2026-01-01T00:00:00.000Z" });

  it("sorts visible first, then by overall score, then oldest first; unscored last", () => {
    expect(sortBestShots([a, b, c, d, e]).map((m) => m.id)).toEqual(["b", "e", "a", "d", "c"]);
  });

  it("splits hidden shots behind 'Show N more'", () => {
    const { shown, hidden } = splitBestShots([c, a, b]);
    expect(shown.map((m) => m.id)).toEqual(["b", "a"]);
    expect(hidden.map((m) => m.id)).toEqual(["c"]);
  });

  it("collects batch media de-duplicated and ranked", () => {
    const all = collectJobMedia([job({ media: [a, c] }), job({ id: "job_2", media: [b, a] })]);
    expect(all.map((m) => m.id)).toEqual(["b", "a", "c"]);
  });

  it("expects the right number of placeholders", () => {
    expect(expectedImages(job())).toBe(3);
    const rerender = job({
      input: generateJobInput.parse({ type: "generate", modelId: "m", fromDraftMediaId: "d", quality: "standard" }),
    });
    expect(expectedImages(rerender)).toBe(1);
  });
});

describe("announcements", () => {
  it("describes each job state for screen readers", () => {
    expect(jobAnnouncement(job({ status: "queued" }), "Drafts")).toBe("Drafts: queued.");
    expect(jobAnnouncement(job({ progress: 42.4 }))).toContain("42% done");
    const done = jobAnnouncement(
      job({ status: "succeeded", media: [media(), media({ id: "h", hidden: true })], blockedCount: 1 }),
    );
    expect(done).toContain("2 photos ready, best shots first.");
    expect(done).toContain("1 weaker shot hidden.");
    expect(done).toContain("1 blocked by the safety filter.");
    expect(jobAnnouncement(job({ status: "failed", creditsRefunded: 4 }))).toContain("Credits refunded.");
    expect(jobAnnouncement(job({ status: "blocked" }))).toContain("safety filter");
  });

  it("summarizes batch progress and buckets announcements to ~10% steps", () => {
    const jobs = [
      job({ status: "succeeded", media: [media()] }),
      job({ status: "failed", creditsRefunded: 1 }),
      job({ status: "running" }),
    ];
    const p = batchProgress({ total: 3, completed: 1, failed: 1 }, jobs);
    expect(p).toEqual({ total: 3, done: 2, succeeded: 1, failed: 1, inFlight: 1, percent: 67, refunded: 1, photos: 1 });

    const at = (done: number) => batchAnnouncement({ ...p, total: 50, done }, false);
    expect(at(0)).toBe("0 of 50 done.");
    expect(at(4)).toBe("0 of 50 done.");
    expect(at(5)).toBe("5 of 50 done.");
    expect(at(9)).toBe("5 of 50 done.");
    expect(batchAnnouncement(p, true)).toBe("Batch finished: 1 photo ready. 1 failed and 1 credit was refunded.");
  });
});

describe("filenameFromDisposition", () => {
  it("reads plain and RFC 5987 filenames and sanitizes paths", () => {
    expect(filenameFromDisposition('attachment; filename="photos.zip"', "x.zip")).toBe("photos.zip");
    expect(filenameFromDisposition("attachment; filename*=UTF-8''caf%C3%A9.zip", "x.zip")).toBe("café.zip");
    expect(filenameFromDisposition('attachment; filename="../../etc/passwd"', "x.zip")).toBe(".._.._etc_passwd");
    expect(filenameFromDisposition(null, "x.zip")).toBe("x.zip");
    expect(filenameFromDisposition("attachment", "x.zip")).toBe("x.zip");
  });
});

describe("pack filtering", () => {
  const pack = (over: Partial<PackSummary>): PackSummary => ({
    slug: "s",
    name: "N",
    tagline: "",
    description: "",
    category: "professional",
    tags: [],
    featured: false,
    isNew: false,
    promptCount: 6,
    sampleTitles: [],
    ...over,
  });
  const packs = [
    pack({ slug: "linkedin", name: "LinkedIn Headshots", tags: ["corporate"] }),
    pack({ slug: "paris", name: "Paris", category: "travel", tagline: "Café mornings", sampleTitles: ["Eiffel tower at dusk"] }),
    pack({ slug: "dating", name: "Dating Natural", category: "dating" }),
  ];

  it("filters by category and by every search word (accent-insensitive)", () => {
    expect(filterPacks(packs, { category: "travel" }).map((p) => p.slug)).toEqual(["paris"]);
    expect(filterPacks(packs, { query: "cafe" }).map((p) => p.slug)).toEqual(["paris"]);
    expect(filterPacks(packs, { query: "eiffel dusk" }).map((p) => p.slug)).toEqual(["paris"]);
    expect(filterPacks(packs, { query: "eiffel corporate" })).toEqual([]);
    expect(filterPacks(packs, { query: "CORPORATE", category: "all" }).map((p) => p.slug)).toEqual(["linkedin"]);
    expect(filterPacks(packs, { query: "  " })).toHaveLength(3);
  });

  it("lists categories in canonical order and validates them", () => {
    expect(packCategoriesIn(packs)).toEqual(["professional", "dating", "travel"]);
    expect(isPackCategory("travel")).toBe(true);
    expect(isPackCategory("nope")).toBe(false);
  });
});

describe("describeApiError", () => {
  it("maps every API error code to a title and message", () => {
    for (const code of [...API_ERROR_CODES, "network" as const]) {
      const e = describeApiError(new ApiClientError(code, "server says", 400));
      expect(e.code).toBe(code);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.message.length).toBeGreaterThan(0);
    }
  });

  it("offers a buy-credits CTA with the shortfall", () => {
    const e = describeApiError(new ApiClientError("insufficient_credits", "x", 402, { needed: 8, balance: 3 }));
    expect(e.message).toContain("needs 8 credits and you have 3");
    expect(e.action).toEqual({ label: "Buy credits", href: "/app/billing" });
  });

  it("explains the content policy for blocked prompts", () => {
    const e = describeApiError(new ApiClientError("content_blocked", "Prompts can't name public figures.", 422));
    expect(e.message).toBe("Prompts can't name public figures.");
    expect(e.hint).toMatch(/public figures/);
    expect(e.action?.href).toBe("/legal/acceptable-use");
  });

  it("gives the retry time for rate limits, with draft-specific copy", () => {
    const err = new ApiClientError("rate_limited", "x", 429, { retryAfterSec: 125 });
    expect(describeApiError(err)).toMatchObject({ retryAfterSec: 125, message: "Please try again in 3 minutes." });
    const draft = describeApiError(err, { draft: true });
    expect(draft.title).toMatch(/free drafts/i);
    expect(draft.message).toContain("Standard quality");
  });

  it("links plan limits to billing and sign-in errors back to the page", () => {
    expect(describeApiError(new ApiClientError("plan_limit", "Up to 2 jobs at once.", 403))).toMatchObject({
      message: "Up to 2 jobs at once.",
      action: { href: "/app/billing" },
    });
    expect(describeApiError(new ApiClientError("unauthorized", "x", 401), { nextPath: "/app/packs/x" }).action?.href).toBe(
      "/login?next=%2Fapp%2Fpacks%2Fx",
    );
  });

  it("falls back safely for unknown values", () => {
    expect(describeApiError(new Error("boom")).code).toBe("internal");
    expect(describeApiError("nope").code).toBe("internal");
    expect(describeApiError(null).title).toBe("Something went wrong");
  });

  it("formats waits", () => {
    expect(formatWait(1)).toBe("1 second");
    expect(formatWait(45)).toBe("45 seconds");
    expect(formatWait(60)).toBe("1 minute");
    expect(formatWait(3601)).toBe("2 hours");
    expect(formatWait(0)).toBe("1 second");
  });
});

describe("modelModesFrom", () => {
  it("uses IdentityModelDTO.mode, falls back to the heuristics and the fallback map", () => {
    expect(
      modelModesFrom(
        [
          { id: "a", mode: "instant" },
          { id: "b", mode: "trained" },
          { id: "c", status: "ready", trainingJobId: null },
          { id: "d", status: "training", trainingJobId: null },
        ],
        { b: "instant", e: "instant" },
      ),
    ).toEqual({ a: "instant", b: "trained", c: "instant", e: "instant" });
    expect(modelModesFrom(undefined, { x: "trained" })).toEqual({ x: "trained" });
    expect(modelModesFrom(undefined)).toEqual({});
  });
});
