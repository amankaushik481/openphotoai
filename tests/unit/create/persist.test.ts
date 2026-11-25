import { describe, expect, it } from "vitest";
import {
  initialCreateSettings,
  parseCreateSettings,
  parseSessionEntries,
  serializeCreateSettings,
  serializeSessionEntries,
  submitBlockReason,
} from "@/components/create/persist";
import type { JobDTO } from "@/types/domain";

describe("create settings", () => {
  it("round-trips valid settings", () => {
    const settings = { modelId: "mdl_abc", mode: "pack", aspectRatio: "3:4", numImages: 2, quality: "high" } as const;
    expect(parseCreateSettings(serializeCreateSettings(settings))).toEqual(settings);
  });

  it("drops anything stale, edited or out of range", () => {
    expect(parseCreateSettings(null)).toEqual({});
    expect(parseCreateSettings("{not json")).toEqual({});
    expect(parseCreateSettings("[1,2]")).toEqual({});
    expect(
      parseCreateSettings(
        JSON.stringify({ modelId: "<script>", mode: "video", aspectRatio: "7:3", numImages: 9, quality: "ultra", extra: 1 }),
      ),
    ).toEqual({});
    expect(parseCreateSettings(JSON.stringify({ numImages: 2.5, quality: "draft" }))).toEqual({ quality: "draft" });
  });

  it("lets deep links win and only restores drafts while some are left", () => {
    const stored = { modelId: "mdl_old", mode: "reference", quality: "draft", numImages: 4 } as const;
    expect(initialCreateSettings(stored, { draftsLeft: 5, deepLink: {} })).toEqual(stored);
    expect(initialCreateSettings(stored, { draftsLeft: 5, deepLink: { modelId: "mdl_new", mode: "pack" } })).toEqual({
      quality: "draft",
      numImages: 4,
    });
    expect(initialCreateSettings(stored, { draftsLeft: 0, deepLink: {} }).quality).toBe("standard");
  });
});

const job = (id: string, status: JobDTO["status"] = "running") =>
  ({
    id,
    type: "generate",
    status,
    progress: 0,
    error: null,
    errorCode: null,
    creditsCharged: 0,
    creditsRefunded: 0,
    modelId: "mdl_1",
    packId: null,
    batchId: null,
    input: { type: "generate", modelId: "mdl_1", prompt: "x", aspectRatio: "4:5", numImages: 1, quality: "draft" },
    media: [],
    blockedCount: 0,
    createdAt: "2026-11-25T10:00:00.000Z",
    completedAt: null,
  }) as unknown as JobDTO;

describe("session results", () => {
  // Regression: results lived in component state only, so a refresh (or a trip to the gallery and
  // back) while photos were still rendering lost the cards, their progress and the draft re-render buttons.
  it("restores this tab's results after a refresh, newest first", () => {
    const entries = [
      { job: job("job_2"), title: "Drafts · yacht" },
      { job: job("job_1", "succeeded"), title: "Photos · office" },
    ];
    const restored = parseSessionEntries(serializeSessionEntries(entries));
    expect(restored.map((e) => [e.job.id, e.job.status, e.title])).toEqual([
      ["job_2", "running", "Drafts · yacht"],
      ["job_1", "succeeded", "Photos · office"],
    ]);
  });

  it("ignores malformed entries and duplicates, and keeps the limit", () => {
    const raw = JSON.stringify([
      { job: job("job_1"), title: "a" },
      { job: job("job_1"), title: "dup" },
      { job: { id: 3 }, title: "bad" },
      { title: "no job" },
      "junk",
      { job: job("job_4"), title: "b" },
      { job: job("job_5"), title: "c" },
    ]);
    expect(parseSessionEntries(raw).map((e) => e.title)).toEqual(["a", "b", "c"]);
    expect(parseSessionEntries(raw, 2).map((e) => e.title)).toEqual(["a", "b"]);
    expect(parseSessionEntries("oops")).toEqual([]);
    expect(serializeSessionEntries([{ job: job("a"), title: "1" }, { job: job("b"), title: "2" }], 1)).not.toContain('"b"');
  });
});

describe("submitBlockReason", () => {
  const ready = [{ status: "ready" }];
  const base = { models: ready, modelId: "mdl_1", quality: "standard" as const, numImages: 4, draftsLeft: 10 };

  it("is null when Generate can be pressed", () => {
    expect(submitBlockReason(base)).toBeNull();
    expect(submitBlockReason({ ...base, quality: "draft", draftsLeft: 4 })).toBeNull();
  });

  // Regression: Generate was disabled without saying why (no model yet, a model still training,
  // or fewer free drafts left than photos requested).
  it("explains a missing or unusable model", () => {
    expect(submitBlockReason({ ...base, modelId: null, models: undefined })).toBeNull();
    expect(submitBlockReason({ ...base, modelId: null, models: [] })).toMatch(/Create your model first/);
    expect(submitBlockReason({ ...base, modelId: null, models: [{ status: "ready", shared: true }] })).toMatch(/Create your model/);
    expect(submitBlockReason({ ...base, modelId: null, models: [{ status: "training" }] })).toMatch(/still training/);
    expect(submitBlockReason({ ...base, modelId: null, models: [{ status: "collecting" }] })).toMatch(/Finish setting up/);
    expect(submitBlockReason({ ...base, modelId: null })).toBe("Choose a model above.");
  });

  it("explains a draft request larger than the free allowance left", () => {
    expect(submitBlockReason({ ...base, quality: "draft", draftsLeft: 2 })).toBe(
      "Only 2 free drafts left today: pick 2 photos or choose Standard.",
    );
    expect(submitBlockReason({ ...base, quality: "draft", draftsLeft: 1 })).toBe(
      "Only 1 free draft left today: pick 1 photo or choose Standard.",
    );
    expect(submitBlockReason({ ...base, quality: "draft", draftsLeft: 0 })).toMatch(/No free drafts left today/);
  });
});
