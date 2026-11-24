import { describe, expect, it } from "vitest";
import {
  buildTalkingVideoRequest,
  buildVideoRequest,
  countWords,
  hasPresetPhrase,
  MAX_MOTION_PROMPT_CHARS,
  MAX_TALKING_SECONDS,
  MAX_TALKING_WORDS,
  MOTION_PRESETS,
  scriptStats,
  togglePresetPhrase,
  VIDEO_DURATIONS,
  videoCredits,
  VOICE_OPTIONS,
  VOICE_ORDER,
} from "@/components/video/video-options";
import { jobErrorText } from "@/components/video/post-job";
import { CREDIT_COSTS, creditCost } from "@/config/credits";
import { ApiClientError } from "@/lib/api-client";
import { createJobRequest, VOICES } from "@/types/domain";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("video cost", () => {
  it("prices 5 s and 10 s clips from the credit table", () => {
    expect(VIDEO_DURATIONS).toEqual([5, 10]);
    expect(videoCredits(5)).toBe(CREDIT_COSTS.video5s);
    expect(videoCredits(10)).toBe(CREDIT_COSTS.video10s);
    expect(videoCredits(5)).toBe(10);
    expect(videoCredits(10)).toBe(18);
  });

  it("matches creditCost for the request the form sends", () => {
    const req = buildVideoRequest({ sourceMediaId: "med_1", prompt: "  ", durationSec: 10 });
    expect(creditCost(req)).toBe(18);
  });
});

describe("talking video script stats", () => {
  it("counts words, estimated seconds and credits per started 5 s", () => {
    expect(scriptStats("")).toMatchObject({ words: 0, seconds: 0, tooShort: true, tooLong: false });
    // 10 words at 2.5 words/s = 4 s -> one 5 s block.
    expect(scriptStats(words(10))).toMatchObject({ words: 10, seconds: 4, credits: 8, tooShort: false, tooLong: false });
    // 13 words -> 6 s -> two blocks.
    expect(scriptStats(words(13))).toMatchObject({ seconds: 6, credits: 16 });
    expect(countWords("  hello   there\nfriend ")).toBe(3);
  });

  it("allows up to MAX_TALKING_WORDS (60 s) and flags anything longer", () => {
    expect(MAX_TALKING_SECONDS).toBe(60);
    expect(MAX_TALKING_WORDS).toBe(150);
    const max = scriptStats(words(MAX_TALKING_WORDS));
    expect(max).toMatchObject({ seconds: 60, tooLong: false, credits: 12 * CREDIT_COSTS.talkingVideoPer5s });
    expect(scriptStats(words(MAX_TALKING_WORDS + 1))).toMatchObject({ seconds: 61, tooLong: true });
  });

  it("uses the same pricing as creditCost on the trimmed script", () => {
    const script = `  ${words(37)}  `;
    const req = buildTalkingVideoRequest({ sourceMediaId: "med_1", script, voice: "calm_male" });
    expect(req.script).toBe(script.trim());
    expect(scriptStats(script).credits).toBe(creditCost(req));
  });
});

describe("motion presets", () => {
  it("toggles a preset phrase in a comma-separated prompt", () => {
    const phrase = MOTION_PRESETS[0]!.phrase;
    const added = togglePresetPhrase("golden hour light", phrase);
    expect(added).toBe(`golden hour light, ${phrase}`);
    expect(hasPresetPhrase(added, phrase)).toBe(true);
    expect(hasPresetPhrase(added.toUpperCase(), phrase)).toBe(true);
    expect(togglePresetPhrase(added, phrase)).toBe("golden hour light");
    expect(togglePresetPhrase("", phrase)).toBe(phrase);
    expect(togglePresetPhrase(phrase, phrase)).toBe("");
  });

  it("doesn't add a phrase past the prompt limit", () => {
    const long = "x".repeat(MAX_MOTION_PROMPT_CHARS - 5);
    expect(togglePresetPhrase(long, "slow push-in")).toBe(long);
  });

  it("has unique ids and phrases that fit the request schema", () => {
    expect(new Set(MOTION_PRESETS.map((p) => p.id)).size).toBe(MOTION_PRESETS.length);
    const all = MOTION_PRESETS.reduce((p, preset) => togglePresetPhrase(p, preset.phrase), "");
    expect(createJobRequest.safeParse(buildVideoRequest({ sourceMediaId: "med_1", prompt: all, durationSec: 5 })).success).toBe(
      true,
    );
  });
});

describe("request builders", () => {
  it("omits a blank motion prompt so the server default applies", () => {
    const req = buildVideoRequest({ sourceMediaId: "med_1", prompt: "   ", durationSec: 5 });
    expect(req).toEqual({ type: "video", sourceMediaId: "med_1", durationSec: 5 });
    expect(createJobRequest.parse(req)).toEqual(req);
    expect(buildVideoRequest({ sourceMediaId: "med_1", prompt: " wave ", durationSec: 5 }).prompt).toBe("wave");
  });

  it("builds a valid talking video request", () => {
    const req = buildTalkingVideoRequest({ sourceMediaId: "med_1", script: " Hello there! ", voice: "warm_female" });
    expect(createJobRequest.parse(req)).toEqual({
      type: "talking_video",
      sourceMediaId: "med_1",
      script: "Hello there!",
      voice: "warm_female",
    });
  });

  it("describes every voice in the schema", () => {
    expect([...VOICE_ORDER].sort()).toEqual([...VOICES].sort());
    for (const v of VOICES) expect(VOICE_OPTIONS[v].description.length).toBeGreaterThan(10);
  });
});

describe("jobErrorText", () => {
  it("shows specific server messages and friendly copy for generic failures", () => {
    expect(jobErrorText(new ApiClientError("validation_error", "Keep your script short.", 400))).toBe("Keep your script short.");
    expect(jobErrorText(new ApiClientError("content_blocked", "Blocked by safety.", 422))).toBe("Blocked by safety.");
    expect(jobErrorText(new ApiClientError("internal", "stack trace", 500))).not.toContain("stack");
    expect(jobErrorText(new ApiClientError("network", "x", 0))).toMatch(/network/i);
    expect(jobErrorText(new Error("boom"))).toBe("Something went wrong.");
  });
});
