import crypto, { type KeyObject } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebhookRequest } from "@/providers/types";
import { WebhookVerificationError } from "@/providers/ai/shared/errors";

vi.mock("@fal-ai/client", () => ({
  createFalClient: vi.fn(() => {
    throw new Error("parseWebhook must not need the fal SDK");
  }),
}));

import { createFalProvider } from "@/providers/ai/fal";
import { FAL_JWKS_URL } from "@/providers/ai/fal/webhook";

const NOW_MS = Date.UTC(2026, 10, 24, 12, 0, 0);

function keypair(): { publicKey: KeyObject; privateKey: KeyObject; x: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { x: string };
  return { publicKey, privateKey, x: jwk.x };
}

const signer = keypair();
const other = keypair();

function jwksResponse(...xs: string[]): Response {
  return Response.json({ keys: [{ kty: "RSA", n: "ignored", e: "AQAB" }, ...xs.map((x) => ({ kty: "OKP", crv: "Ed25519", x, kid: x.slice(0, 6) }))] });
}

function signedRequest(
  body: unknown,
  opts: { key?: KeyObject; requestId?: string; userId?: string; timestampSec?: number; rawBody?: string } = {},
): WebhookRequest {
  const rawBody = opts.rawBody ?? JSON.stringify(body);
  const requestId = opts.requestId ?? "req-abc";
  const userId = opts.userId ?? "user-1";
  const ts = String(opts.timestampSec ?? Math.floor(NOW_MS / 1000));
  const hash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const message = Buffer.from([requestId, userId, ts, hash].join("\n"), "utf8");
  const sig = crypto.sign(null, message, opts.key ?? signer.privateKey).toString("hex");
  return {
    rawBody,
    url: "https://app.test/api/webhooks/ai/fal",
    headers: new Headers({
      "X-Fal-Webhook-Request-Id": requestId,
      "X-Fal-Webhook-User-Id": userId,
      "X-Fal-Webhook-Timestamp": ts,
      "X-Fal-Webhook-Signature": sig,
      "content-type": "application/json",
    }),
  };
}

const okBody = {
  request_id: "req-abc",
  gateway_request_id: "gw-abc",
  status: "OK",
  payload: {
    images: [{ url: "https://v3.fal.media/out.jpg", width: 896, height: 1120, content_type: "image/jpeg" }],
    has_nsfw_concepts: [true],
    seed: 77,
  },
};

let now = NOW_MS;
let fetchMock: ReturnType<typeof vi.fn>;

function provider() {
  return createFalProvider({ apiKey: "k", fetch: fetchMock as unknown as typeof fetch, now: () => now });
}

beforeEach(() => {
  now = NOW_MS;
  fetchMock = vi.fn(async () => jwksResponse(signer.x));
});

describe("fal webhook verification", () => {
  it("accepts a valid signature and normalizes the payload", async () => {
    const event = await provider().parseWebhook(signedRequest(okBody));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(FAL_JWKS_URL);
    expect(event).toEqual({
      eventId: "req-abc:OK",
      requestId: "req-abc",
      status: {
        state: "succeeded",
        output: {
          raw: okBody.payload,
          seed: 77,
          images: [{ url: "https://v3.fal.media/out.jpg", width: 896, height: 1120, contentType: "image/jpeg", nsfw: true, seed: 77 }],
        },
      },
    });
  });

  it("caches the JWKS across webhooks (24 h)", async () => {
    const p = provider();
    await p.parseWebhook(signedRequest(okBody));
    now += 23 * 3600_000;
    await p.parseWebhook(signedRequest(okBody, { timestampSec: Math.floor(now / 1000) }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 2 * 3600_000;
    await p.parseWebhook(signedRequest(okBody, { timestampSec: Math.floor(now / 1000) }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a tampered body", async () => {
    const req = signedRequest(okBody);
    const tampered = { ...req, rawBody: req.rawBody.replace("out.jpg", "evil.jpg") };
    await expect(provider().parseWebhook(tampered)).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it("rejects a stale or future timestamp (more than 5 minutes away)", async () => {
    const stale = signedRequest(okBody, { timestampSec: Math.floor(NOW_MS / 1000) - 301 });
    await expect(provider().parseWebhook(stale)).rejects.toThrow(/timestamp/);
    const future = signedRequest(okBody, { timestampSec: Math.floor(NOW_MS / 1000) + 301 });
    await expect(provider().parseWebhook(future)).rejects.toThrow(/timestamp/);
    const edge = signedRequest(okBody, { timestampSec: Math.floor(NOW_MS / 1000) - 299 });
    await expect(provider().parseWebhook(edge)).resolves.toMatchObject({ requestId: "req-abc" });
  });

  it("rejects a signature from an unknown key without hammering the JWKS endpoint", async () => {
    const req = signedRequest(okBody, { key: other.privateKey });
    await expect(provider().parseWebhook(req)).rejects.toThrow(/Invalid fal webhook signature/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches the JWKS once to pick up a rotated key when the cache is older than a minute", async () => {
    const p = provider();
    await p.parseWebhook(signedRequest(okBody));
    fetchMock.mockImplementation(async () => jwksResponse(signer.x, other.x));
    now += 5 * 60_000;
    const rotated = signedRequest(okBody, { key: other.privateKey, timestampSec: Math.floor(now / 1000) });
    await expect(p.parseWebhook(rotated)).resolves.toMatchObject({ eventId: "req-abc:OK" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects missing headers and malformed signatures", async () => {
    const req = signedRequest(okBody);
    const noSig = new Headers(req.headers);
    noSig.delete("x-fal-webhook-signature");
    await expect(provider().parseWebhook({ ...req, headers: noSig })).rejects.toThrow(/Missing/);
    const badSig = new Headers(req.headers);
    badSig.set("x-fal-webhook-signature", "zz");
    await expect(provider().parseWebhook({ ...req, headers: badSig })).rejects.toThrow(/Malformed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a body whose request id does not match the signed header", async () => {
    const req = signedRequest({ ...okBody, request_id: "someone-else", gateway_request_id: "gw-x" }, { requestId: "req-abc" });
    await expect(provider().parseWebhook(req)).rejects.toThrow(/does not match/);
  });

  it("fails closed when the JWKS cannot be fetched", async () => {
    fetchMock.mockImplementation(async () => new Response("down", { status: 503 }));
    await expect(provider().parseWebhook(signedRequest(okBody))).rejects.toThrow(/Could not load fal webhook keys/);
  });
});

describe("fal webhook payloads", () => {
  it("maps ERROR to a failed status with the validation detail", async () => {
    const body = {
      request_id: "req-abc",
      status: "ERROR",
      error: "Invalid status code: 422",
      payload: { detail: [{ loc: ["body", "image_url"], msg: "Could not download the image", type: "x" }] },
    };
    const event = await provider().parseWebhook(signedRequest(body));
    expect(event).toEqual({
      eventId: "req-abc:ERROR",
      requestId: "req-abc",
      status: { state: "failed", error: "Invalid status code: 422: image_url: Could not download the image", retryable: false },
    });
  });

  it("marks transient ERRORs retryable", async () => {
    const body = { request_id: "req-abc", status: "ERROR", error: "Request timed out", payload: null };
    const event = await provider().parseWebhook(signedRequest(body));
    expect(event.status).toMatchObject({ state: "failed", retryable: true });
  });

  it("leaves the status empty when fal could not serialize the payload (engine polls)", async () => {
    const body = { request_id: "req-abc", status: "OK", payload: null, payload_error: "Response payload too large" };
    const event = await provider().parseWebhook(signedRequest(body));
    expect(event).toEqual({ eventId: "req-abc:OK", requestId: "req-abc" });
  });

  it("normalizes a training payload to modelRef", async () => {
    const body = {
      request_id: "req-abc",
      status: "OK",
      payload: { diffusers_lora_file: { url: "https://v3.fal.media/lora.safetensors" }, config_file: { url: "https://v3.fal.media/c.json" } },
    };
    const event = await provider().parseWebhook(signedRequest(body));
    expect(event.status).toMatchObject({ state: "succeeded", output: { modelRef: "https://v3.fal.media/lora.safetensors" } });
  });

  it("accepts the gateway request id in the signed header", async () => {
    const event = await provider().parseWebhook(signedRequest(okBody, { requestId: "gw-abc" }));
    expect(event.requestId).toBe("req-abc");
  });

  it("rejects unexpected JSON", async () => {
    await expect(provider().parseWebhook(signedRequest({ hello: "world" }))).rejects.toThrow(/Unexpected/);
    await expect(provider().parseWebhook(signedRequest(null, { rawBody: "not json" }))).rejects.toThrow(/JSON/);
  });
});
