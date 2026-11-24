import { createHmac, randomBytes } from "node:crypto";
import { validateWebhook } from "replicate";
import { describe, expect, it } from "vitest";
import { createReplicateProvider } from "@/providers/ai/replicate";
import { WebhookVerificationError } from "@/providers/ai/shared/errors";
import { parseReplicateWebhook, verifyReplicateSignature } from "@/providers/ai/replicate/webhook";
import type { WebhookRequest } from "@/providers/types";

const SECRET = `whsec_${randomBytes(24).toString("base64")}`;
const OTHER_SECRET = `whsec_${randomBytes(24).toString("base64")}`;

/** Signs exactly as Replicate (Standard Webhooks) does. */
function sign(secret: string, id: string, ts: number, body: string): string {
  const key = Buffer.from(secret.split("_").pop()!, "base64");
  return createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
}

function request(
  body: unknown,
  opts: { secret?: string; ts?: number; id?: string; signature?: string } = {},
): WebhookRequest {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  const id = opts.id ?? "msg_2Abc";
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const signature = opts.signature ?? `v1,${sign(opts.secret ?? SECRET, id, ts, rawBody)}`;
  return {
    rawBody,
    url: "https://app.example.com/api/webhooks/ai/replicate",
    headers: new Headers({ "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": signature }),
  };
}

const prediction = {
  id: "pred123",
  model: "black-forest-labs/flux-dev-lora",
  status: "succeeded",
  output: ["https://replicate.delivery/x/out-0.jpg"],
  urls: { get: "https://api.replicate.com/v1/predictions/pred123" },
};

describe("Replicate webhook verification", () => {
  it("accepts a valid signature and normalizes the prediction", async () => {
    const p = createReplicateProvider({ apiToken: "t", owner: "acme", webhookSecret: SECRET });
    const event = await p.parseWebhook(request(prediction));
    expect(event).toEqual({
      eventId: "msg_2Abc",
      requestId: "pred123",
      status: {
        state: "succeeded",
        output: expect.objectContaining({
          images: [{ url: "https://replicate.delivery/x/out-0.jpg", contentType: "image/jpeg" }],
        }),
      },
    });
  });

  it("agrees with the SDK's own validateWebhook", async () => {
    const req = request(prediction);
    const sdkSays = await validateWebhook({
      id: req.headers.get("webhook-id")!,
      timestamp: req.headers.get("webhook-timestamp")!,
      signature: req.headers.get("webhook-signature")!,
      body: req.rawBody,
      secret: SECRET,
    });
    expect(sdkSays).toBe(true);
    expect(() => verifyReplicateSignature(req, SECRET)).not.toThrow();
  });

  it("rejects a tampered body", () => {
    const req = request(prediction);
    const tampered = { ...req, rawBody: req.rawBody.replace("out-0.jpg", "evil.jpg") };
    expect(() => parseReplicateWebhook(tampered, SECRET)).toThrow(WebhookVerificationError);
  });

  it("rejects stale and far-future timestamps (±5 min)", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => parseReplicateWebhook(request(prediction, { ts: now - 301 }), SECRET)).toThrow(/tolerance/);
    expect(() => parseReplicateWebhook(request(prediction, { ts: now + 301 }), SECRET)).toThrow(/tolerance/);
    expect(() => parseReplicateWebhook(request(prediction, { ts: now - 299 }), SECRET)).not.toThrow();
  });

  it("rejects a signature made with another secret", () => {
    expect(() => parseReplicateWebhook(request(prediction, { secret: OTHER_SECRET }), SECRET)).toThrow(
      /Invalid Replicate webhook signature/,
    );
  });

  it("rejects missing headers, unknown versions and an unconfigured secret", async () => {
    const req = request(prediction);
    const noSig = { ...req, headers: new Headers({ "webhook-id": "x", "webhook-timestamp": "1" }) };
    expect(() => parseReplicateWebhook(noSig, SECRET)).toThrow(WebhookVerificationError);

    const v2 = request(prediction, {
      signature: `v2,${sign(SECRET, "msg_2Abc", Math.floor(Date.now() / 1000), JSON.stringify(prediction))}`,
    });
    expect(() => parseReplicateWebhook(v2, SECRET)).toThrow(WebhookVerificationError);

    const p = createReplicateProvider({ apiToken: "t", owner: "acme" });
    await expect(p.parseWebhook(request(prediction))).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it("accepts when any of several space-separated signatures matches (key rotation)", () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify(prediction);
    const signature = `v1,${sign(OTHER_SECRET, "msg_2Abc", ts, body)} v1,${sign(SECRET, "msg_2Abc", ts, body)}`;
    expect(parseReplicateWebhook(request(body, { ts, signature }), SECRET).requestId).toBe("pred123");
  });

  it("maps training webhooks to trn: request ids with the trained model ref", () => {
    const body = {
      id: "trn999",
      model: "replicate/fast-flux-trainer",
      status: "succeeded",
      output: {
        version: `acme/openshoot-ohwxabcdef:${"d".repeat(64)}`,
        weights: "https://replicate.delivery/w/trained_model.tar",
      },
      urls: { get: "https://api.replicate.com/v1/trainings/trn999" },
    };
    const event = parseReplicateWebhook(request(body), SECRET);
    expect(event.requestId).toBe("trn:trn999");
    expect(event.status).toMatchObject({
      state: "succeeded",
      output: {
        modelRef: `acme/openshoot-ohwxabcdef:${"d".repeat(64)}|https://replicate.delivery/w/trained_model.tar`,
      },
    });
  });

  it("normalizes failed predictions and rejects non-JSON bodies", () => {
    const failed = parseReplicateWebhook(
      request({ ...prediction, status: "failed", output: null, error: "NSFW content detected" }),
      SECRET,
    );
    expect(failed.status).toEqual({ state: "failed", error: "NSFW content detected", retryable: false });
    expect(() => parseReplicateWebhook(request("not json"), SECRET)).toThrow(/not valid JSON/);
  });
});
