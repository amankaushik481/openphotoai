import { describe, expect, it } from "vitest";

import { allFaqItems, featuredFaqItems, getFaqCategories, pricingFaqItems, yearlyMonthsFree } from "@/content/faq";
import { parseInline, paragraphs, toPlainText } from "@/content/inline";
import { buildFaqPageJsonLd, serializeJsonLd } from "@/content/structured-data";
import { PLANS } from "@/config/plans";

describe("FAQ content", () => {
  it("has the five categories, each with questions", () => {
    const categories = getFaqCategories();
    expect(categories.map((c) => c.id)).toEqual([
      "getting-started",
      "photos-quality",
      "privacy-safety",
      "billing",
      "self-hosting",
    ]);
    for (const c of categories) expect(c.items.length).toBeGreaterThan(0);
  });

  it("uses unique, anchor-safe ids", () => {
    const ids = allFaqItems().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("has landing and pricing subsets", () => {
    expect(featuredFaqItems().length).toBeGreaterThanOrEqual(3);
    const pricing = pricingFaqItems().map((i) => i.id);
    expect(pricing).toEqual(expect.arrayContaining(["refunds", "likeness-guarantee", "credits-expire"]));
  });

  it("derives numbers from config instead of hard-coding them", () => {
    const expected = Math.round(12 - PLANS.pro.yearlyPriceCents / PLANS.pro.monthlyPriceCents);
    expect(yearlyMonthsFree()).toBe(expected);
    const subscription = allFaqItems().find((i) => i.id === "subscription-needed")!;
    if (expected > 0) expect(subscription.answer).toContain(`${expected} months free`);
  });

  it("never leaves template placeholders in the copy", () => {
    for (const item of allFaqItems()) {
      expect(item.answer).not.toMatch(/\{\{|\}\}|undefined|NaN/);
      expect(item.question).not.toMatch(/\{\{|undefined/);
    }
  });
});

describe("buildFaqPageJsonLd", () => {
  it("builds a schema.org FAQPage with one Question per item", () => {
    const items = allFaqItems();
    const ld = buildFaqPageJsonLd(items);
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("FAQPage");
    const main = ld.mainEntity as { "@type": string; name: string; acceptedAnswer: { "@type": string; text: string } }[];
    expect(main).toHaveLength(items.length);
    for (const q of main) {
      expect(q["@type"]).toBe("Question");
      expect(q.acceptedAnswer["@type"]).toBe("Answer");
      expect(q.name.length).toBeGreaterThan(0);
      expect(q.acceptedAnswer.text.length).toBeGreaterThan(0);
    }
  });

  it("strips inline markup from answers", () => {
    const ld = buildFaqPageJsonLd([
      { question: "Is it **free**?", answer: "See [pricing](/pricing) or email help@example.com. Run `pnpm dev`." },
    ]);
    const [q] = ld.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(q!.name).toBe("Is it free?");
    expect(q!.acceptedAnswer.text).toBe("See pricing or email help@example.com. Run pnpm dev.");
  });

  it("serializes safely inside a script tag", () => {
    const json = serializeJsonLd(buildFaqPageJsonLd([{ question: "</script><b>x</b>", answer: "a & b" }]));
    expect(json).not.toContain("</script>");
    expect(json).not.toContain("<");
    expect(JSON.parse(json).mainEntity[0].name).toBe("</script><b>x</b>");
    expect(JSON.parse(json).mainEntity[0].acceptedAnswer.text).toBe("a & b");
  });
});

describe("inline markup", () => {
  it("tokenizes bold, code, links and bare emails", () => {
    expect(parseInline("A **b** `c` [d](/e) f@g.io.")).toEqual([
      { type: "text", text: "A " },
      { type: "strong", text: "b" },
      { type: "text", text: " " },
      { type: "code", text: "c" },
      { type: "text", text: " " },
      { type: "link", text: "d", href: "/e" },
      { type: "text", text: " " },
      { type: "link", text: "f@g.io", href: "mailto:f@g.io" },
      { type: "text", text: "." },
    ]);
  });

  it("keeps plain text untouched and splits paragraphs", () => {
    expect(toPlainText("just text")).toBe("just text");
    expect(paragraphs("one\n\n two \n\n\nthree")).toEqual(["one", "two", "three"]);
  });
});
