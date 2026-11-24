/**
 * SEC-3 / SEC-18: API-key scopes and the per-key rate limit apply to EVERY route that accepts API keys
 * (`user_or_api` included), not only /api/v1. Real API-key auth, no session mock.
 * Ported from the review probe scope-bypass.probe.ts.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as creditsGet } from "@/app/api/credits/route";
import { GET as mediaIdGet } from "@/app/api/media/[id]/route";
import { GET as mediaGet } from "@/app/api/media/route";
import { GET as modelIdGet } from "@/app/api/models/[id]/route";
import { GET as modelsGet } from "@/app/api/models/route";
import { GET as v1MediaGet } from "@/app/api/v1/media/route";
import type { UserRow } from "@/db/types";
import { createApiKey } from "@/server/auth/api-keys";
import { route } from "@/server/http";
import { checkRateLimit } from "@/server/rate-limit";
import type { ApiKeyScope } from "@/types/domain";
import { createTestDb, createTestMedia, createTestModel, createTestUser } from "../../helpers/factories";

vi.mock("@/server/email", () => ({ sendEmail: vi.fn(async () => ({ id: "eml" })), sendEmailSafe: vi.fn() }));

type Handler = (r: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>;

const call = (h: unknown, url: string, key: string, params: Record<string, string> = {}, method = "GET") =>
  (h as Handler)(new NextRequest(`http://localhost:3000${url}`, { method, headers: { authorization: `Bearer ${key}` } }), {
    params: Promise.resolve(params),
  });

let u: UserRow;
let mediaId: string;
let modelId: string;

beforeEach(async () => {
  await createTestDb();
  u = await createTestUser({ plan: "pro", hasPaid: true });
  mediaId = (await createTestMedia(u.id)).id;
  modelId = (await createTestModel(u.id)).id;
});

async function keyWith(scopes: ApiKeyScope[]) {
  return createApiKey(u.id, scopes.join("+"), scopes);
}

describe("scopes on user_or_api routes", () => {
  it("refuses a generate-only key on every read route (it used to read the whole gallery)", async () => {
    const { key } = await keyWith(["generate"]);
    expect((await call(v1MediaGet, "/api/v1/media", key)).status).toBe(403);
    for (const [handler, url, params] of [
      [mediaGet, "/api/media", {}],
      [mediaIdGet, `/api/media/${mediaId}`, { id: mediaId }],
      [modelsGet, "/api/models", {}],
      [modelIdGet, `/api/models/${modelId}`, { id: modelId }],
      [creditsGet, "/api/credits", {}],
    ] as const) {
      const res = await call(handler, url, key, params);
      expect(res.status, url).toBe(403);
      expect((await res.json()).error).toMatchObject({ code: "forbidden", message: expect.stringContaining('"read"') });
    }
  });

  it("lets read and * keys read", async () => {
    for (const scopes of [["read"], ["*"]] as ApiKeyScope[][]) {
      const { key } = await keyWith(scopes);
      expect((await call(mediaGet, "/api/media", key)).status).toBe(200);
      expect((await call(modelsGet, "/api/models", key)).status).toBe(200);
      expect((await call(creditsGet, "/api/credits", key)).status).toBe(200);
    }
  });

  it("requires generate for writes by default, and honours an explicit scope", async () => {
    const write = route({ auth: "user_or_api" }, async () => ({ ok: true }));
    const explicitRead = route({ auth: "user_or_api", scope: "read" }, async () => ({ ok: true }));
    const read = (await keyWith(["read"])).key;
    const gen = (await keyWith(["generate"])).key;
    expect((await call(write, "/x", read, {}, "POST")).status).toBe(403);
    expect((await call(write, "/x", gen, {}, "POST")).status).toBe(200);
    expect((await call(explicitRead, "/x", read, {}, "POST")).status).toBe(200);
  });
});

describe("per-key rate limit on user_or_api routes", () => {
  it("counts API-key requests against apiPerMinute (429 once exhausted)", async () => {
    const { key, row } = await keyWith(["read"]);
    expect((await call(mediaGet, "/api/media", key)).status).toBe(200);
    await checkRateLimit("apiPerMinute", `key:${row.id}`, 119);
    const res = await call(creditsGet, "/api/credits", key);
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("rate_limited");
  });
});
