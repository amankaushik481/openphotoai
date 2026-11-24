import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  createOpenAIModerationProvider,
  mapOpenAIModeration,
  type OpenAIModerationOutcome,
} from "@/providers/safety/openai-moderation";

const ALL_CATEGORIES = [
  "harassment",
  "harassment/threatening",
  "hate",
  "hate/threatening",
  "illicit",
  "illicit/violent",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "sexual",
  "sexual/minors",
  "violence",
  "violence/graphic",
];

function outcome(flags: string[] = [], scores: Record<string, number> = {}): OpenAIModerationOutcome {
  return {
    flagged: flags.length > 0,
    categories: Object.fromEntries(ALL_CATEGORIES.map((c) => [c, flags.includes(c)])),
    category_scores: Object.fromEntries(ALL_CATEGORIES.map((c) => [c, scores[c] ?? (flags.includes(c) ? 0.9 : 0.001)])),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("mapOpenAIModeration", () => {
  it.each([
    ["benign", outcome(), true, []],
    ["sexual", outcome(["sexual"]), false, ["sexual"]],
    ["sexual/minors", outcome(["sexual/minors"]), false, ["minors", "sexual"]],
    ["violence/graphic", outcome(["violence", "violence/graphic"]), false, ["violence"]],
    ["hate", outcome(["hate"]), false, ["hate"]],
    ["hate/threatening", outcome(["hate/threatening"]), false, ["hate"]],
    ["harassment/threatening", outcome(["harassment", "harassment/threatening"]), false, ["harassment"]],
    ["self-harm/intent", outcome(["self-harm/intent"]), false, ["self_harm"]],
    ["illicit/violent", outcome(["illicit/violent"]), false, ["illicit"]],
    ["plain violence only (not blocking)", outcome(["violence"]), true, []],
    ["plain harassment only (not blocking)", outcome(["harassment"]), true, []],
    ["plain illicit only (not blocking)", outcome(["illicit"]), true, []],
    ["sexual score over our stricter threshold", outcome([], { sexual: 0.55 }), false, ["sexual"]],
    ["sexual/minors score over our stricter threshold", outcome([], { "sexual/minors": 0.12 }), false, ["minors", "sexual"]],
    ["sexual score under threshold", outcome([], { sexual: 0.3 }), true, []],
  ])("%s", (_name, input, allowed, categories) => {
    const r = mapOpenAIModeration(input);
    expect(r.allowed).toBe(allowed);
    expect([...r.categories].sort()).toEqual([...categories].sort());
    expect(r.provider).toBe("openai");
    expect(r.scores?.sexual).toBeTypeOf("number");
    if (!allowed) expect(r.reason).toMatch(/^openai: /);
  });
});

describe("createOpenAIModerationProvider", () => {
  it("requires an API key", () => {
    expect(() => createOpenAIModerationProvider({ apiKey: "" })).toThrow();
  });

  it("posts text to omni-moderation-latest with bearer auth", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ id: "modr-1", model: "omni-moderation-latest", results: [outcome(["sexual"])] }),
    );
    const p = createOpenAIModerationProvider({ apiKey: "sk-test", fetch: fetchMock as unknown as typeof fetch });
    const res = await p.checkText("something explicit");
    expect(res).toMatchObject({ allowed: false, categories: ["sexual"], provider: "openai" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/moderations");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    expect(JSON.parse(String(init?.body))).toEqual({ model: "omni-moderation-latest", input: "something explicit" });
  });

  it("allows empty text without calling the API", async () => {
    const fetchMock = vi.fn();
    const p = createOpenAIModerationProvider({ apiKey: "sk-test", fetch: fetchMock as unknown as typeof fetch });
    await expect(p.checkText("   ")).resolves.toMatchObject({ allowed: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends images as a base64 JPEG data URL", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse({ results: [outcome()] }));
    const p = createOpenAIModerationProvider({ apiKey: "sk-test", fetch: fetchMock as unknown as typeof fetch });
    const png = new Uint8Array(await sharp({ create: { width: 32, height: 32, channels: 4, background: "#ff0000" } }).png().toBuffer());
    await expect(p.checkImage(png)).resolves.toMatchObject({ allowed: true, categories: [] });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      input: { type: string; image_url: { url: string } }[];
    };
    expect(body.input).toHaveLength(1);
    expect(body.input[0].type).toBe("image_url");
    expect(body.input[0].image_url.url).toMatch(/^data:image\/jpeg;base64,\/9j\//);
  });

  it.each([
    ["network error", () => Promise.reject(new TypeError("fetch failed"))],
    ["HTTP 500", async () => new Response("upstream error", { status: 500 })],
    ["HTTP 429", async () => new Response("rate limited", { status: 429 })],
    ["malformed body", async () => jsonResponse({ results: [] })],
    ["non-JSON body", async () => new Response("<html>", { status: 200 })],
  ])("throws on %s so callers fail closed", async (_name, impl) => {
    const p = createOpenAIModerationProvider({ apiKey: "sk-test", fetch: vi.fn(impl) as unknown as typeof fetch });
    await expect(p.checkText("hello")).rejects.toThrow();
  });
});
