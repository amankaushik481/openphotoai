import { describe, expect, it } from "vitest";

import { APP } from "@/config/app";
import {
  LEGAL_PAGES,
  LEGAL_TEMPLATES,
  documentStrings,
  findPlaceholders,
  getLegalDocument,
  getLegalVariables,
  interpolateTemplate,
  renderLegalDocument,
  type LegalSlug,
} from "@/content/legal";

const SLUGS: LegalSlug[] = ["terms", "privacy", "acceptable-use"];

const custom = getLegalVariables({
  appName: "PixelPal",
  appUrl: "https://pixelpal.example",
  legalEntity: "PixelPal Labs GmbH",
  jurisdiction: "Berlin, Germany",
  supportEmail: "help@pixelpal.example",
  takedownEmail: "abuse@pixelpal.example",
  refundWindowDays: 21,
  takedownUrgentHours: 36,
});

function text(slug: LegalSlug, vars = custom): string {
  return documentStrings(getLegalDocument(slug, vars)).join("\n");
}

describe("legal template interpolation", () => {
  it("replaces known placeholders and leaves unknown ones visible", () => {
    expect(interpolateTemplate("{{appName}} by {{ legalEntity }}", custom)).toBe("PixelPal by PixelPal Labs GmbH");
    expect(interpolateTemplate("{{nope}} stays", custom)).toBe("{{nope}} stays");
    expect(findPlaceholders("a {{x}} b {{ y }}")).toEqual(["x", "y"]);
  });

  it("defaults come from public app config", () => {
    const vars = getLegalVariables();
    expect(vars.appName).toBe(APP.name);
    expect(vars.legalEntity).toBe(APP.legalEntity);
    expect(vars.jurisdiction).toBe(APP.legalJurisdiction);
    expect(vars.supportEmail).toBe(APP.supportEmail);
    expect(vars.takedownEmail).toBe(APP.takedownEmail);
  });

  it.each(SLUGS)("%s: every placeholder is filled", (slug) => {
    const rendered = renderLegalDocument(LEGAL_TEMPLATES[slug], custom);
    for (const s of documentStrings(rendered)) expect(findPlaceholders(s)).toEqual([]);
  });

  it.each(SLUGS)("%s: is pure (the template keeps its placeholders)", (slug) => {
    const before = JSON.stringify(LEGAL_TEMPLATES[slug]);
    renderLegalDocument(LEGAL_TEMPLATES[slug], custom);
    expect(JSON.stringify(LEGAL_TEMPLATES[slug])).toBe(before);
    expect(before).toContain("{{");
  });

  it("injects operator details into the documents", () => {
    const terms = text("terms");
    expect(terms).toContain("PixelPal Labs GmbH");
    expect(terms).toContain("Berlin, Germany");
    expect(terms).toContain("https://pixelpal.example");
    expect(terms).toContain("21 days");
    expect(text("acceptable-use")).toContain("abuse@pixelpal.example");
    expect(text("acceptable-use")).toContain("36 hours");
    expect(text("privacy")).toContain("help@pixelpal.example");
  });

  it("has unique section ids per document and a page entry per template", () => {
    for (const slug of SLUGS) {
      const ids = LEGAL_TEMPLATES[slug].sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(LEGAL_PAGES.map((p) => p.slug).sort()).toEqual([...SLUGS].sort());
  });
});

describe("legal template coverage", () => {
  const all = SLUGS.map((s) => text(s)).join("\n").toLowerCase();

  it.each([
    ["AI-generated labeling", /ai-generated/],
    ["consent requirement", /consent/],
    ["adults only", /adults only|at least 18/],
    ["no sexual content", /no sexual|no nudity/],
    ["public figures / impersonation", /public figures?/],
    ["impersonation", /impersonat/],
    ["deceptive use", /decepti/],
    ["biometric data", /biometric/],
    ["face embeddings", /face embedding/],
    ["deleted with the model", /deleted together with it|deleted with the model|deleted together/],
    ["data retention", /how long we keep data|retention/],
    ["deletion confirmed by email", /confirmation link/],
    ["subprocessors", /subprocessor/],
    ["payments subprocessor", /stripe/],
    ["email subprocessor", /resend/],
    ["takedown process", /takedown/],
    ["report button", /report button/],
    ["response times", /within 24 hours|acknowledge/],
    ["account suspension", /suspen/],
    ["refund policy", /refund/],
    ["open source / self-hosting", /self-host/],
    ["MIT license", /mit license/],
  ])("covers %s", (_label, pattern) => {
    expect(all).toMatch(pattern);
  });

  it("privacy policy limits face embeddings to consent verification and likeness scoring", () => {
    const privacy = text("privacy").toLowerCase();
    expect(privacy).toContain("consent verification");
    expect(privacy).toContain("likeness scoring");
  });
});
