/** Server-render the /docs/api page: every endpoint documented, internal links resolve, no external assets. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ApiDocsPage, { dynamic, metadata } from "@/app/(marketing)/docs/api/page";
import { quickstartSamples } from "@/components/api-docs/quickstart";
import { propertyRows, typeParts } from "@/components/api-docs/schema-view";
import { v1Operations } from "@/server/openapi/operations";
import { buildOpenApiSpec } from "@/server/openapi/spec";
import { API_ERROR_CODES } from "@/types/domain";

const html = renderToStaticMarkup(<ApiDocsPage />);

describe("/docs/api", () => {
  it("is static with metadata", () => {
    expect(dynamic).toBe("force-static");
    expect(metadata.title).toBe("API reference");
  });

  it("documents every operation, error code and schema", () => {
    expect(html).toContain("<h1");
    for (const op of Object.values(v1Operations)) {
      expect(html, op.operationId).toContain(`id="${op.operationId}"`);
      expect(html).toContain(`/api/v1${op.path}`);
      expect(html).toContain(op.summary);
    }
    for (const code of API_ERROR_CODES) expect(html).toContain(code);
    for (const name of Object.keys(buildOpenApiSpec().components.schemas))
      expect(html).toContain(`id="schema-${name}"`);
    for (const section of ["authentication", "quickstart", "jobs", "idempotency", "rate-limits", "errors"]) {
      expect(html).toContain(`id="${section}"`);
    }
  });

  it("server-renders all quickstart samples (curl, JavaScript, Python)", () => {
    expect(html).toContain("Idempotency-Key");
    expect(html).toContain("requests.get(media[&quot;downloadUrl&quot;]");
    expect(html).toContain("await fetch(media.downloadUrl)");
    expect(html).toContain("jq -r .job.id");
  });

  it("has no broken in-page links and loads nothing from external CDNs", () => {
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!);
    expect(anchors.length).toBeGreaterThan(20);
    for (const a of anchors) expect(ids.has(a), `#${a}`).toBe(true);
    expect(html).not.toMatch(/<script[^>]+src="https?:/);
    expect(html).not.toMatch(/<link[^>]+href="https?:/);
  });
});

describe("schema-view helpers", () => {
  it("labels types readably", () => {
    const text = (s: Parameters<typeof typeParts>[0]) =>
      typeParts(s)
        .map((p) => p.text)
        .join("");
    expect(text({ $ref: "#/components/schemas/Job" })).toBe("Job");
    expect(text({ type: ["string", "null"] })).toBe("string | null");
    expect(text({ type: "array", items: { $ref: "#/components/schemas/Media" } })).toBe("Media[]");
    expect(text({ anyOf: [{ $ref: "#/components/schemas/MediaScores" }, { type: "null" }] })).toBe(
      "MediaScores | null",
    );
    expect(text({ type: "string", enum: ["a", "b"] })).toBe('"a" | "b"');
    expect(text({ type: "array", prefixItems: [{ type: "string" }, { type: "string" }] })).toBe("[string, string]");
    const rows = propertyRows({
      type: "object",
      required: ["b"],
      properties: { a: { type: "integer", minimum: 1, maximum: 4, default: 2 }, b: { type: "string", maxLength: 9 } },
    });
    expect(rows.map((r) => [r.name, r.required, r.constraints])).toEqual([
      ["b", true, ["≤ 9 chars"]],
      ["a", false, ["1–4", "default 2"]],
    ]);
    const nested = propertyRows({
      type: "object",
      properties: { m: { type: "object", required: ["w"], properties: { w: { type: "integer" } } } },
    });
    expect(nested.map((r) => [r.name, r.required])).toEqual([
      ["m", false],
      ["m.w", true],
    ]);
  });

  it("builds samples against the given base URL", () => {
    const samples = quickstartSamples("https://x.test/api/v1", "https://x.test/app/api-keys");
    expect(samples.map((s) => s.id)).toEqual(["curl", "javascript", "python"]);
    for (const s of samples) expect(s.code).toContain("https://x.test/api/v1");
  });
});
