import { describe, expect, it } from "vitest";
import { ASPECT_RATIOS } from "@/types/domain";
import { fitAspectRatio, MEGAPIXEL } from "@/providers/ai/shared/sizes";
import { buildTemplatePrompt, cleanUserRequest } from "@/providers/ai/shared/prompt-template";
import { parsePromptHelperOutput } from "@/providers/ai/shared/prompt-helper";
import { replaceTrigger } from "@/providers/ai/shared/identity-prompts";
import { llmModelSlug } from "@/providers/ai/fal/inputs";
import { progressFromLogs } from "@/providers/ai/fal/normalize";

describe("fitAspectRatio", () => {
  it.each([
    ["1:1", 1024, 1024],
    ["4:5", 896, 1120],
    ["3:4", 864, 1152],
    ["2:3", 832, 1248],
    ["9:16", 720, 1280],
    ["16:9", 1280, 720],
    ["3:2", 1248, 832],
    ["5:4", 1120, 896],
  ] as const)("%s at 1 MP -> %ix%i", (ratio, width, height) => {
    expect(fitAspectRatio(ratio, { maxPixels: MEGAPIXEL })).toEqual({ width, height });
  });

  it.each(ASPECT_RATIOS)("%s respects a 512 px long side and multiples of 16", (ratio) => {
    const { width, height } = fitAspectRatio(ratio, { maxPixels: MEGAPIXEL, maxLongSide: 512 });
    expect(Math.max(width, height)).toBeLessThanOrEqual(512);
    expect(Math.max(width, height)).toBeGreaterThanOrEqual(448);
    expect(width % 16 + (height % 16)).toBe(0);
  });

  it("falls back to an approximate ratio when the exact grid is too coarse", () => {
    const { width, height } = fitAspectRatio("9:16", { maxPixels: 100 * 100, maxLongSide: 200 });
    expect(width * height).toBeLessThanOrEqual(100 * 100);
    expect(width % 16 + (height % 16)).toBe(0);
    expect(height).toBeGreaterThan(width);
  });
});

describe("prompt template fallback", () => {
  it("is deterministic and keeps the {subject} placeholder exactly once", () => {
    const a = buildTemplatePrompt({ request: "me on a yacht at sunset looking rich", subject: "man", style: "editorial" });
    const b = buildTemplatePrompt({ request: "me on a yacht at sunset looking rich", subject: "man", style: "editorial" });
    expect(a).toEqual(b);
    expect(a.prompt.split("{subject}")).toHaveLength(2);
    expect(a.prompt).toMatch(/^professional photo of \{subject\}, on a yacht at sunset looking rich, editorial style, /);
    expect(a.prompt).not.toContain("soft natural lighting");
    expect(a.suggestions).toHaveLength(3);
  });

  it("strips self references and injected placeholders", () => {
    expect(cleanUserRequest("A photo of me {subject} hiking\n in the Alps")).toBe("hiking in the Alps");
    expect(cleanUserRequest("myself, in a suit")).toBe("in a suit");
  });
});

describe("parsePromptHelperOutput", () => {
  it("parses fenced JSON and trims suggestions", () => {
    const out = parsePromptHelperOutput('Here you go:\n```json\n{"prompt":"photo of {subject}, at a desk","suggestions":["a","b","c","d"]}\n```');
    expect(out).toEqual({ prompt: "photo of {subject}, at a desk", suggestions: ["a", "b", "c"] });
  });

  it("handles braces inside strings and rejects unusable answers", () => {
    expect(parsePromptHelperOutput('{"prompt":"photo of {subject} with a {curly} sign"}')?.prompt).toBe(
      "photo of {subject} with a {curly} sign",
    );
    expect(parsePromptHelperOutput("no json")).toBeNull();
    expect(parsePromptHelperOutput('{"prompt": ""}')).toBeNull();
    expect(parsePromptHelperOutput('{"text": "x"}')).toBeNull();
  });
});

describe("identity prompt helpers", () => {
  it("replaces the trigger word and a following subject noun", () => {
    expect(replaceTrigger("photo of OHWX man, smiling; ohwx looks up", { triggerWord: "ohwx" }, "the man")).toBe(
      "photo of the man, smiling; the man looks up",
    );
    expect(replaceTrigger("photo of {subject} at work", { triggerWord: "tok" }, "person A")).toBe("photo of person A at work");
  });
});

describe("fal helpers", () => {
  it("reads the LLM model slug from MODELS.fal.llm", () => {
    expect(llmModelSlug()).toBe("google/gemini-3.1-flash-lite");
  });

  it("parses progress from the latest log line", () => {
    expect(progressFromLogs(["step 3/10", "Training: 45%|####"])).toBe(45);
    expect(progressFromLogs(["step 7/28"])).toBe(25);
    expect(progressFromLogs(["loading"])).toBeUndefined();
  });
});
