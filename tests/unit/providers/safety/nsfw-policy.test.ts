import { describe, expect, it } from "vitest";
import { DEFAULT_NSFW_THRESHOLDS, evaluateNsfw, toNsfwScores, type NsfwScores } from "@/providers/safety/nsfw-policy";

const s = (p: Partial<NsfwScores>): NsfwScores => {
  const base = { Drawing: 0, Hentai: 0, Porn: 0, Sexy: 0, ...p };
  const rest = 1 - (base.Drawing + base.Hentai + base.Porn + base.Sexy);
  return { Neutral: Math.max(0, rest), ...base };
};

describe("evaluateNsfw (default thresholds)", () => {
  it.each([
    ["neutral photo", s({}), true, undefined],
    ["drawing", s({ Drawing: 0.9 }), true, undefined],
    ["porn just below explicit", s({ Porn: 0.49 }), true, undefined],
    ["porn at explicit", s({ Porn: 0.5 }), false, "explicit"],
    ["porn + hentai sum", s({ Porn: 0.3, Hentai: 0.2 }), false, "explicit"],
    ["hentai drawing", s({ Hentai: 0.7, Drawing: 0.2 }), false, "explicit"],
    ["sexy below suggestive", s({ Sexy: 0.59 }), true, undefined],
    ["sexy at suggestive", s({ Sexy: 0.6 }), false, "sexualized"],
    ["split mass reaches combined", s({ Porn: 0.35, Sexy: 0.35 }), false, "combined"],
    ["split mass below combined", s({ Porn: 0.3, Sexy: 0.3 }), true, undefined],
  ])("%s → allowed=%s", (_name, scores, allowed, reasonPart) => {
    const d = evaluateNsfw(scores);
    expect(d.allowed).toBe(allowed);
    expect(d.categories).toEqual(allowed ? [] : ["sexual"]);
    if (reasonPart) expect(d.reason).toContain(reasonPart);
    else expect(d.reason).toBeUndefined();
  });

  it("reports named and derived scores", () => {
    const d = evaluateNsfw(s({ Porn: 0.1, Hentai: 0.05, Sexy: 0.2 }));
    expect(d.scores).toMatchObject({ porn: 0.1, hentai: 0.05, sexy: 0.2, explicit: 0.15, sexual_total: 0.35 });
  });

  it("honours custom thresholds", () => {
    expect(evaluateNsfw(s({ Sexy: 0.3 }), { ...DEFAULT_NSFW_THRESHOLDS, suggestive: 0.25 }).allowed).toBe(false);
  });
});

describe("toNsfwScores", () => {
  it("maps nsfwjs class order", () => {
    expect(toNsfwScores([0.1, 0.2, 0.3, 0.15, 0.25])).toEqual({
      Drawing: 0.1,
      Hentai: 0.2,
      Neutral: 0.3,
      Porn: 0.15,
      Sexy: 0.25,
    });
  });

  it("rejects malformed output (fail closed)", () => {
    expect(() => toNsfwScores([0.5, 0.5])).toThrow();
    expect(() => toNsfwScores([Number.NaN, 0, 0, 0, 1])).toThrow();
  });
});
