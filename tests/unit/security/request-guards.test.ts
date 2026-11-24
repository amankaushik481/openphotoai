/**
 * SEC-6: request bodies are capped while streaming (webhooks, JSON, multipart, Better Auth), so a
 * chunked body without Content-Length can't make the server buffer unbounded data.
 * SEC-12: cookie-authenticated writes refuse cross-site requests (Sec-Fetch-Site / Origin).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { POST as authPost } from "@/app/api/auth/[...all]/route";
import { POST as uploadPost } from "@/app/api/uploads/route";
import { POST as aiWebhook } from "@/app/api/webhooks/ai/[provider]/route";
import { POST as paymentWebhook } from "@/app/api/webhooks/payments/[provider]/route";
import { BODY_LIMITS, parseBody, readBodyLimited, route } from "@/server/http";
import { callRoute, createTestDb, createTestUser, sessionMock } from "../../helpers/factories";

vi.mock("@/server/auth/session", async () => (await import("../../helpers/session")).sessionMock);
vi.mock("@/server/email", () => ({ sendEmail: vi.fn(async () => ({ id: "eml" })), sendEmailSafe: vi.fn() }));

/** A streamed body of `total` bytes in 64 KB chunks, counting how many chunks were pulled. */
function stream(total: number) {
  const chunk = new Uint8Array(64 * 1024).fill(0x61);
  const state = { pulled: 0 };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const sent = state.pulled * chunk.byteLength;
      if (sent >= total) return controller.close();
      state.pulled++;
      controller.enqueue(chunk.subarray(0, Math.min(chunk.byteLength, total - sent)));
    },
  });
  return { body, state };
}

const chunkedRequest = (url: string, total: number, headers: Record<string, string> = {}) => {
  const { body, state } = stream(total);
  // No Content-Length: like `Transfer-Encoding: chunked`.
  const req = new NextRequest(`http://localhost:3000${url}`, { method: "POST", body, headers, duplex: "half" } as RequestInit & {
    duplex: "half";
  });
  return { req, state };
};

describe("readBodyLimited", () => {
  it("refuses a declared Content-Length over the cap before reading", async () => {
    const req = new Request("http://x/", { method: "POST", body: "x".repeat(10), headers: { "content-length": "999999" } });
    await expect(readBodyLimited(req, 100)).rejects.toMatchObject({ code: "payload_too_large", status: 413 });
  });

  it("stops reading an undeclared stream as soon as it passes the cap", async () => {
    const { req, state } = chunkedRequest("/x", 50 * 1024 * 1024);
    await expect(readBodyLimited(req, 256 * 1024)).rejects.toMatchObject({ code: "payload_too_large" });
    expect(state.pulled).toBeLessThan(10); // ~256 KB read, not 50 MB
  });

  it("returns the body when it fits", async () => {
    const req = new Request("http://x/", { method: "POST", body: "hello" });
    expect(new TextDecoder().decode(await readBodyLimited(req, 5))).toBe("hello");
  });

  it("caps parseBody at BODY_LIMITS.json", async () => {
    const { req } = chunkedRequest("/x", BODY_LIMITS.json + 1);
    await expect(parseBody(req, z.unknown())).rejects.toMatchObject({ code: "payload_too_large" });
  });
});

describe("routes", () => {
  beforeEach(async () => {
    await createTestDb();
    sessionMock.reset();
  });

  it("413s an oversized unauthenticated webhook body before verifying it", async () => {
    for (const [handler, provider] of [
      [aiWebhook, "mock"],
      [paymentWebhook, "mock"],
    ] as const) {
      const { req, state } = chunkedRequest(`/api/webhooks/x/${provider}`, 64 * 1024 * 1024);
      const res = await handler(req, { params: Promise.resolve({ provider }) });
      expect(res.status).toBe(413);
      // Stopped right after the cap (plus the stream's small read-ahead), not after 64 MB.
      expect(state.pulled * 64 * 1024).toBeLessThanOrEqual(BODY_LIMITS.webhook + 1024 * 1024);
    }
  });

  it("413s a chunked multipart upload without Content-Length", async () => {
    sessionMock.setUser(await createTestUser());
    const { req } = chunkedRequest("/api/uploads", 20 * 1024 * 1024, { "content-type": "multipart/form-data; boundary=x" });
    const res = await uploadPost(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("payload_too_large");
  });

  it("413s an oversized Better Auth request", async () => {
    const { req } = chunkedRequest("/api/auth/sign-in/magic-link", BODY_LIMITS.auth + 1, { "content-type": "application/json" });
    expect((await authPost(req)).status).toBe(413);
  });
});

describe("CSRF: cookie-authenticated writes", () => {
  const write = route({ auth: "user" }, async () => ({ ok: true }));
  const read = route({ auth: "user" }, async () => ({ ok: true }));

  beforeEach(async () => {
    await createTestDb();
    sessionMock.reset();
    sessionMock.setUser(await createTestUser());
  });

  it("refuses cross-site and same-site (sibling origin) requests", async () => {
    for (const headers of [
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site", origin: "http://localhost:9000" },
      { origin: "https://evil.example" },
      { origin: "null" },
    ]) {
      const res = await callRoute(write, { method: "POST", url: "/api/share", body: "{}", headers });
      expect(res.status, JSON.stringify(headers)).toBe(403);
    }
  });

  it("allows same-origin browsers, non-browser clients and safe methods", async () => {
    expect((await callRoute(write, { method: "POST", body: "{}", headers: { "sec-fetch-site": "same-origin" } })).status).toBe(200);
    expect((await callRoute(write, { method: "POST", body: "{}", headers: { origin: "http://localhost:3000" } })).status).toBe(200);
    expect((await callRoute(write, { method: "POST", body: "{}" })).status).toBe(200);
    expect((await callRoute(read, { method: "GET", headers: { "sec-fetch-site": "cross-site" } })).status).toBe(200);
  });

  it("doesn't apply to API-key requests (no ambient credentials)", async () => {
    const user = await createTestUser({ plan: "pro" });
    sessionMock.setUser(user, {
      apiKey: { id: "key_1", userId: user.id, name: "k", prefix: "os_live_ab", keyHash: "h", scopes: ["*"], lastUsedAt: null, revokedAt: null, createdAt: new Date() },
    });
    const api = route({ auth: "user_or_api" }, async () => ({ ok: true }));
    expect((await callRoute(api, { method: "POST", body: "{}", headers: { "sec-fetch-site": "cross-site" } })).status).toBe(200);
  });
});
