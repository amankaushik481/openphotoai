import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { errorMessage, interpolate, t, tCount, translate, type TranslationKey } from "@/i18n";
import { API_ERROR_CODES } from "@/types/domain";

describe("t()", () => {
  it("resolves nested dot-path keys", () => {
    expect(t("nav.pricing")).toBe("Pricing");
    expect(t("nav.groups.studio")).toBe("Studio");
  });

  it("interpolates variables, including numbers and repeated placeholders", () => {
    expect(t("dashboard.welcome", { name: "Ada" })).toBe("Welcome back, Ada");
    expect(t("credits.balance", { count: 42 })).toBe("42 credits");
    expect(interpolate("{a} and {a} or {b}", { a: "x", b: 0 })).toBe("x and x or 0");
  });

  it("leaves unknown placeholders visible instead of printing 'undefined'", () => {
    expect(t("dashboard.welcome")).toBe("Welcome back, {name}");
    expect(t("dashboard.welcome", { other: "x" })).toBe("Welcome back, {name}");
  });

  it("falls back to the key itself for missing keys", () => {
    expect(t("nav.doesNotExist" as TranslationKey)).toBe("nav.doesNotExist");
    expect(t("nav" as TranslationKey)).toBe("nav"); // a branch, not a string leaf
  });

  it("falls back to English when a locale is missing a key", () => {
    const partialGerman = { nav: { pricing: "Preise" } };
    expect(translate(partialGerman, "nav.pricing")).toBe("Preise");
    expect(translate(partialGerman, "nav.faq")).toBe("FAQ");
    expect(translate(partialGerman, "nope.missing")).toBe("nope.missing");
  });

  it("picks singular/plural variants with tCount", () => {
    expect(tCount("credits.balance", "credits.balanceOne", 1)).toBe("1 credit");
    expect(tCount("credits.balance", "credits.balanceOne", 1500)).toBe("1,500 credits");
  });

  it("has a friendly message for every API error code", () => {
    for (const code of API_ERROR_CODES) {
      const msg = errorMessage(code);
      expect(msg).not.toBe(`errors.${code}`);
      expect(en.errors[code]).toBe(msg);
    }
    expect(errorMessage("network")).toBe(en.errors.network);
    expect(errorMessage(undefined)).toBe(en.errors.generic);
  });
});
