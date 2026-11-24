import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getPackRoute } from "@/app/api/packs/[slug]/route";
import { GET as listPacksRoute } from "@/app/api/packs/route";
import { listPacks } from "@/server/packs/registry";
import type { Pack } from "@/types/pack";
import { callRoute } from "../../helpers/route";
import { sessionMock } from "../../helpers/session";

vi.mock("@/server/auth/session", () => sessionMock);

const SUMMARY_KEYS = [
  "slug",
  "name",
  "tagline",
  "description",
  "category",
  "emoji",
  "tags",
  "colors",
  "cover",
  "featured",
  "isNew",
  "promptCount",
  "sampleTitles",
];

/** Every piece of prompt text a pack holds (templates + negative prompts) — none may be served. */
function secretTexts(pack: Pack): string[] {
  return [
    pack.negativePrompt,
    ...pack.prompts.flatMap((p) => [p.prompt, p.promptMan, p.promptWoman, p.negativePrompt]),
  ].filter((s): s is string => Boolean(s && s.length >= 20));
}

let packs: Pack[];
beforeEach(async () => {
  sessionMock.reset();
  packs = await listPacks();
});

describe("GET /api/packs", () => {
  it("is public and lists every pack as a summary", async () => {
    const res = await callRoute(listPacksRoute, { url: "/api/packs" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/public/);
    expect(packs.length).toBeGreaterThan(0);
    expect(res.json.packs).toHaveLength(packs.length);
    for (const p of res.json.packs as Record<string, unknown>[]) {
      expect(Object.keys(p).every((k) => SUMMARY_KEYS.includes(k))).toBe(true);
      expect(p).not.toHaveProperty("prompts");
      expect(p).not.toHaveProperty("negativePrompt");
    }
  });

  it("never leaks prompt templates", async () => {
    const res = await callRoute(listPacksRoute, { url: "/api/packs" });
    const body = JSON.stringify(res.json);
    for (const pack of packs) for (const text of secretTexts(pack)) expect(body).not.toContain(text);
  });
});

describe("GET /api/packs/:slug", () => {
  it("returns the summary plus shot titles only", async () => {
    const pack = packs[0]!;
    const res = await callRoute(getPackRoute, { url: `/api/packs/${pack.slug}`, params: { slug: pack.slug } });
    expect(res.status).toBe(200);
    const dto = res.json.pack;
    expect(dto.slug).toBe(pack.slug);
    expect(dto.defaultAspectRatio).toBe(pack.defaultAspectRatio);
    expect(dto.promptCount).toBe(pack.prompts.length);
    expect(dto.prompts).toEqual(pack.prompts.map((p) => ({ title: p.title })));
    expect(dto).not.toHaveProperty("negativePrompt");
  });

  it("never leaks prompt templates for any pack", async () => {
    for (const pack of packs) {
      const res = await callRoute(getPackRoute, { url: `/api/packs/${pack.slug}`, params: { slug: pack.slug } });
      const body = JSON.stringify(res.json);
      for (const text of secretTexts(pack)) expect(body).not.toContain(text);
      for (const p of res.json.pack.prompts as Record<string, unknown>[]) expect(Object.keys(p)).toEqual(["title"]);
    }
  });

  it("404s for unknown packs", async () => {
    const res = await callRoute(getPackRoute, { url: "/api/packs/nope", params: { slug: "does-not-exist" } });
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("not_found");
  });
});
