import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODELS } from "@/config/models";
import { createReplicateProvider } from "@/providers/ai/replicate";
import { ProviderRequestError } from "@/providers/ai/shared/errors";
import type { IdentityRef } from "@/providers/types";
import { apiError, createdInput, createdOptions, fake, resetFake } from "./fake-replicate";

vi.mock("replicate", async () => (await import("./fake-replicate")).replicateModule);

const R = MODELS.replicate;
const HASH = "a".repeat(64);
const WEIGHTS = "https://replicate.delivery/xezq/abc/trained_model.tar";
const WEBHOOK = { webhookUrl: "https://app.example.com/api/webhooks/ai/replicate" };

const trained: IdentityRef = {
  modelRef: `acme/openshoot-ohwxabcdef:${HASH}|${WEIGHTS}`,
  triggerWord: "ohwxabcdef",
  subject: "woman",
};
const instant: IdentityRef = {
  modelRef: "",
  triggerWord: "ohwxzyxwvu",
  subject: "man",
  referenceImageUrls: ["https://cdn.example.com/r1.jpg", "https://cdn.example.com/r2.jpg"],
};

function provider() {
  return createReplicateProvider({ apiToken: "r8_test_token", webhookSecret: "whsec_c2VjcmV0", owner: "acme" });
}

beforeEach(() => {
  resetFake();
});

describe("client", () => {
  it("is constructed lazily, once, with auth and plain URL outputs", async () => {
    const p = provider();
    expect(fake.constructed).toHaveLength(0);
    await p.submitRemoveBackground({ imageUrl: "https://cdn.example.com/a.jpg" });
    await p.submitRemoveBackground({ imageUrl: "https://cdn.example.com/b.jpg" });
    expect(fake.constructed).toHaveLength(1);
    expect(fake.constructed[0]).toMatchObject({ auth: "r8_test_token", useFileOutput: false });
  });

  it("requires a token and an owner", () => {
    expect(() => createReplicateProvider({ apiToken: "", owner: "acme" })).toThrow();
    expect(() => createReplicateProvider({ apiToken: "t", owner: "" })).toThrow();
  });
});

describe("submitGenerate", () => {
  it("maps a trained identity to flux-dev-lora with the LoRA weights, safety on and the webhook", async () => {
    const ref = await provider().submitGenerate(
      { prompt: "photo of ohwxabcdef woman in Paris", identity: trained, aspectRatio: "4:5", numImages: 4, quality: "standard", seed: 7 },
      WEBHOOK,
    );
    expect(ref).toEqual({ provider: "replicate", endpoint: R.generate.id, requestId: "pred1" });
    expect(fake.predictions.create).toHaveBeenCalledTimes(1);
    expect(createdOptions()).toMatchObject({
      model: "black-forest-labs/flux-dev-lora",
      webhook: WEBHOOK.webhookUrl,
      webhook_events_filter: ["completed"],
    });
    expect(createdOptions()).not.toHaveProperty("version");
    expect(createdInput()).toMatchObject({
      prompt: "photo of ohwxabcdef woman in Paris",
      lora_weights: WEIGHTS,
      aspect_ratio: "4:5",
      num_outputs: 4,
      num_inference_steps: 28,
      megapixels: "1",
      go_fast: false,
      seed: 7,
      disable_safety_checker: false,
    });
  });

  it("falls back to the owner/name/version LoRA form when no weights URL is known", async () => {
    await provider().submitGenerate({
      prompt: "photo of ohwxabcdef woman",
      identity: { ...trained, modelRef: `acme/openshoot-ohwxabcdef:${HASH}` },
      aspectRatio: "1:1",
      numImages: 1,
      quality: "standard",
    });
    expect(createdInput().lora_weights).toBe(`acme/openshoot-ohwxabcdef/${HASH}`);
  });

  it("uses fast low-res settings for drafts", async () => {
    const ref = await provider().submitGenerate({ prompt: "p", identity: trained, aspectRatio: "9:16", numImages: 1, quality: "draft" });
    expect(ref.endpoint).toBe(R.draft.id);
    expect(createdInput()).toMatchObject({ num_inference_steps: 8, megapixels: "0.25", go_fast: true, num_outputs: 1 });
  });

  it("passes a style reference as img2img", async () => {
    await provider().submitGenerate({
      prompt: "p",
      identity: trained,
      aspectRatio: "4:5",
      numImages: 1,
      quality: "high",
      referenceImageUrl: "https://cdn.example.com/style.jpg",
      referenceStrength: 0.5,
    });
    expect(createdInput()).toMatchObject({ image: "https://cdn.example.com/style.jpg", prompt_strength: 0.5, output_format: "png" });
  });

  it("splits more than 4 images into a polled prediction group with distinct seeds", async () => {
    const ref = await provider().submitGenerate(
      { prompt: "p", identity: trained, aspectRatio: "4:5", numImages: 6, quality: "standard", seed: 100 },
      WEBHOOK,
    );
    expect(ref.requestId).toBe("grp:pred1,pred2");
    expect(fake.predictions.create).toHaveBeenCalledTimes(2);
    expect(createdInput(0)).toMatchObject({ num_outputs: 4, seed: 100 });
    expect(createdInput(1)).toMatchObject({ num_outputs: 2, seed: 101 });
    expect(createdOptions(0)).not.toHaveProperty("webhook");
  });

  it("cancels already-started predictions when part of a group fails to start", async () => {
    fake.predictions.create
      .mockResolvedValueOnce({ id: "ok1", status: "starting" })
      .mockRejectedValueOnce(apiError(422, "bad input"));
    const err = await provider()
      .submitGenerate({ prompt: "p", identity: trained, aspectRatio: "4:5", numImages: 8, quality: "standard" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderRequestError);
    expect(err).toMatchObject({ status: 422, retryable: false });
    expect(fake.predictions.cancel).toHaveBeenCalledWith("ok1");
  });

  it("generates instant-mode identities from reference photos with nano-banana-2 (no trigger word)", async () => {
    const ref = await provider().submitGenerate({
      prompt: "photo of ohwxzyxwvu man on a yacht",
      identity: instant,
      aspectRatio: "3:4",
      numImages: 2,
      quality: "standard",
    });
    expect(ref.endpoint).toBe(R.editMulti.id);
    expect(ref.requestId).toBe("grp:pred1,pred2");
    const input = createdInput();
    expect(input.image_input).toEqual(instant.referenceImageUrls);
    expect(input).toMatchObject({ aspect_ratio: "3:4", resolution: "1K", safety_filter_level: "block_low_and_above" });
    expect(String(input.prompt)).not.toContain("ohwxzyxwvu");
    expect(String(input.prompt)).toContain("on a yacht");
  });

  it("rejects identities without weights or reference photos before calling the API", async () => {
    const err = await provider()
      .submitGenerate({ prompt: "p", identity: { ...instant, referenceImageUrls: [] }, aspectRatio: "1:1", numImages: 1, quality: "standard" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderRequestError);
    expect(err).toMatchObject({ retryable: false });
    expect(fake.predictions.create).not.toHaveBeenCalled();
  });
});

describe("submitEdit", () => {
  it("instruct edits the source image with nano-banana-2", async () => {
    const ref = await provider().submitEdit(
      { mode: "instruct", prompt: "change the jacket to a red blazer", imageUrls: ["https://cdn.example.com/src.jpg"], numImages: 1 },
      WEBHOOK,
    );
    expect(ref).toMatchObject({ endpoint: "google/nano-banana-2", requestId: "pred1" });
    expect(createdOptions()).toMatchObject({ model: "google/nano-banana-2", webhook: WEBHOOK.webhookUrl });
    expect(createdInput()).toMatchObject({
      image_input: ["https://cdn.example.com/src.jpg"],
      aspect_ratio: "match_input_image",
      safety_filter_level: "block_low_and_above",
    });
    expect(String(createdInput().prompt)).toContain("red blazer");
  });

  it("pose copy puts the pose reference first, then the identity's photos", async () => {
    await provider().submitEdit({
      mode: "pose_copy",
      prompt: "",
      imageUrls: ["https://cdn.example.com/pose.jpg"],
      identity: instant,
      numImages: 1,
    });
    expect(createdInput().image_input).toEqual(["https://cdn.example.com/pose.jpg", ...instant.referenceImageUrls!]);
    expect(String(createdInput().prompt)).toContain("image 1");
  });

  it("pose copy with only a trained LoRA uses flux-dev-lora img2img", async () => {
    await provider().submitEdit({ mode: "pose_copy", prompt: "", imageUrls: ["https://cdn.example.com/pose.jpg"], identity: trained, numImages: 1 });
    expect(createdOptions()).toMatchObject({ model: R.generate.id });
    expect(createdInput()).toMatchObject({ image: "https://cdn.example.com/pose.jpg", lora_weights: WEIGHTS });
    expect(String(createdInput().prompt)).toContain("ohwxabcdef woman");
  });

  it("multi-person combines both identities' references and labels each person", async () => {
    const second: IdentityRef = { ...instant, triggerWord: "ohwxsecond", subject: "woman", referenceImageUrls: ["https://cdn.example.com/s1.jpg"] };
    await provider().submitEdit({
      mode: "multi_person",
      prompt: "ohwxzyxwvu man and ohwxsecond woman at a picnic",
      imageUrls: [],
      identities: [instant, second],
      numImages: 1,
    });
    const input = createdInput();
    expect(input.image_input).toEqual([...instant.referenceImageUrls!, "https://cdn.example.com/s1.jpg"]);
    expect(String(input.prompt)).toContain("person A");
    expect(String(input.prompt)).toContain("person B");
    expect(String(input.prompt)).not.toMatch(/ohwx/);
  });
});

describe("other image methods", () => {
  it("inpaints with the trained destination version when the identity has one", async () => {
    const ref = await provider().submitInpaint({
      imageUrl: "https://cdn.example.com/src.jpg",
      maskUrl: "https://cdn.example.com/mask.png",
      prompt: "photo of ohwxabcdef woman smiling",
      identity: trained,
    });
    expect(ref.endpoint).toBe("acme/openshoot-ohwxabcdef");
    expect(createdOptions()).toMatchObject({ version: HASH });
    expect(createdOptions()).not.toHaveProperty("model");
    expect(createdInput()).toMatchObject({ image: "https://cdn.example.com/src.jpg", mask: "https://cdn.example.com/mask.png", disable_safety_checker: false });
  });

  it("inpaints with flux-fill-pro at the strictest safety tolerance otherwise", async () => {
    const ref = await provider().submitInpaint({
      imageUrl: "https://cdn.example.com/src.jpg",
      maskUrl: "https://cdn.example.com/mask.png",
      prompt: "a blue sky",
    });
    expect(ref.endpoint).toBe(R.inpaint.id);
    expect(createdInput()).toMatchObject({ prompt: "a blue sky", safety_tolerance: 1 });
  });

  it("upscales with topaz", async () => {
    const ref = await provider().submitUpscale({ imageUrl: "https://cdn.example.com/src.jpg", scale: 4, faceRestore: true });
    expect(ref.endpoint).toBe(R.upscale.id);
    expect(createdInput()).toMatchObject({ image: "https://cdn.example.com/src.jpg", upscale_factor: "4x", face_enhancement: true });
  });

  it("restores faces with CodeFormer at its resolved latest version", async () => {
    fake.models.get.mockResolvedValue({ latest_version: { id: "cf123" } });
    const ref = await provider().submitFaceRestore({ imageUrl: "https://cdn.example.com/src.jpg" });
    expect(fake.models.get).toHaveBeenCalledWith("sczhou", "codeformer");
    expect(createdOptions()).toMatchObject({ version: "cf123" });
    expect(createdInput()).toMatchObject({ image: "https://cdn.example.com/src.jpg", codeformer_fidelity: 0.7 });
    expect(ref.endpoint).toBe(R.faceRestore.id);
  });

  it("removes backgrounds with the pinned birefnet version (no lookup)", async () => {
    await provider().submitRemoveBackground({ imageUrl: "https://cdn.example.com/src.jpg" });
    expect(fake.models.get).not.toHaveBeenCalled();
    expect(createdOptions()).toMatchObject({ version: R.removeBg.version, input: { image: "https://cdn.example.com/src.jpg" } });
  });

  it("tries garments on with nano-banana-2 [person, garment], never idm-vton", async () => {
    const ref = await provider().submitTryOn({
      personImageUrl: "https://cdn.example.com/me.jpg",
      garmentImageUrl: "https://cdn.example.com/shirt.jpg",
      category: "tops",
    });
    expect(ref.endpoint).toBe("google/nano-banana-2");
    expect(createdInput().image_input).toEqual(["https://cdn.example.com/me.jpg", "https://cdn.example.com/shirt.jpg"]);
    expect(String(createdInput().prompt)).toContain("top");
    expect(JSON.stringify(fake.predictions.create.mock.calls)).not.toContain("idm-vton");
  });
});

describe("video", () => {
  it("animates a photo with kling", async () => {
    const ref = await provider().submitImageToVideo({ imageUrl: "https://cdn.example.com/me.jpg", prompt: "", durationSec: 10 }, WEBHOOK);
    expect(ref).toMatchObject({ endpoint: R.imageToVideo.id, requestId: "pred1" });
    expect(createdInput()).toMatchObject({ start_image: "https://cdn.example.com/me.jpg", duration: 10 });
    expect(String(createdInput().prompt).length).toBeGreaterThan(0);
  });

  it("runs TTS synchronously, then queues the avatar prediction with the audio", async () => {
    fake.run.mockResolvedValue("https://replicate.delivery/audio/speech.mp3");
    const ref = await provider().submitTalkingVideo(
      { imageUrl: "https://cdn.example.com/me.jpg", script: "Hello there!", voice: "deep_male" },
      WEBHOOK,
    );
    expect(fake.run).toHaveBeenCalledWith(R.tts.id, expect.objectContaining({ input: { text: "Hello there!", voice_id: "Deep_Voice_Man" } }));
    expect(ref).toMatchObject({ endpoint: R.talkingVideo.id, requestId: "pred1" });
    expect(createdOptions()).toMatchObject({
      model: R.talkingVideo.id,
      input: { image: "https://cdn.example.com/me.jpg", audio: "https://replicate.delivery/audio/speech.mp3" },
      webhook: WEBHOOK.webhookUrl,
    });
  });

  it("fails cleanly when TTS returns no audio", async () => {
    fake.run.mockResolvedValue(null);
    await expect(
      provider().submitTalkingVideo({ imageUrl: "https://cdn.example.com/me.jpg", script: "Hi", voice: "neutral" }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
    expect(fake.predictions.create).not.toHaveBeenCalled();
  });
});

describe("promptHelper", () => {
  it("joins the LLM's streamed chunks and parses its JSON", async () => {
    fake.run.mockResolvedValue(['{"prompt": "photo of {subject} on a yacht at sunset", ', '"negativePrompt": "blurry", "suggestions": ["Add an outfit"]}']);
    const out = await provider().promptHelper({ request: "me on a yacht", subject: "man" });
    expect(out.prompt).toBe("photo of {subject} on a yacht at sunset");
    expect(out.negativePrompt).toBe("blurry");
    expect(fake.run).toHaveBeenCalledWith(R.llm.id, expect.objectContaining({ input: expect.objectContaining({ system_prompt: expect.any(String) }) }));
  });

  it("falls back to the deterministic template on LLM errors or unusable output", async () => {
    fake.run.mockRejectedValueOnce(new Error("boom"));
    const a = await provider().promptHelper({ request: "me on a yacht", subject: "man" });
    expect(a.prompt).toContain("{subject}");
    expect(a.prompt).toContain("yacht");

    fake.run.mockResolvedValueOnce(["not json"]);
    const b = await provider().promptHelper({ request: "me hiking", subject: "woman" });
    expect(b.prompt).toContain("{subject}");
  });
});

describe("files", () => {
  it("uploads inputs with files.create and returns the get URL", async () => {
    fake.files.create.mockResolvedValue({ id: "f1", urls: { get: "https://api.replicate.com/v1/files/f1/download?sig=x" } });
    const url = await provider().uploadInput(new Uint8Array([1, 2, 3]), "application/zip", "selfies.zip");
    expect(url).toBe("https://api.replicate.com/v1/files/f1/download?sig=x");
    const file = fake.files.create.mock.calls[0][0] as File;
    expect(file).toBeInstanceOf(Blob);
    expect(file.type).toBe("application/zip");
    expect(file.name).toBe("selfies.zip");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("fetches outputs, sending the token only to api.replicate.com", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([9, 9]), { headers: { "content-type": "application/octet-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const p = provider();
      const cdn = await p.fetchOutput("https://replicate.delivery/xezq/out-0.webp");
      expect(cdn).toEqual({ bytes: new Uint8Array([9, 9]), contentType: "image/webp" });
      const cdnInit = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit | undefined;
      expect(new Headers(cdnInit?.headers).get("authorization")).toBeNull();

      await p.fetchOutput("https://api.replicate.com/v1/files/f1/download");
      const apiInit = (fetchMock.mock.calls[1] as unknown[])[1] as RequestInit;
      expect(new Headers(apiInit.headers).get("authorization")).toBe("Bearer r8_test_token");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("decodes data: URL outputs without a network call", async () => {
    const out = await provider().fetchOutput(`data:audio/mpeg;base64,${Buffer.from("abc").toString("base64")}`);
    expect(out.contentType).toBe("audio/mpeg");
    expect(Buffer.from(out.bytes).toString()).toBe("abc");
  });
});
