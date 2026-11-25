import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODELS } from "@/config/models";
import type { GenerateInput, IdentityRef, ProviderJobRef } from "@/providers/types";
import { ASPECT_RATIOS } from "@/types/domain";
import { ProviderDeletionUnsupportedError, ProviderRequestError } from "@/providers/ai/shared/errors";

const client = vi.hoisted(() => ({
  queue: { submit: vi.fn(), status: vi.fn(), result: vi.fn(), cancel: vi.fn() },
  storage: { upload: vi.fn() },
  run: vi.fn(),
  subscribe: vi.fn(),
}));
const createFalClient = vi.hoisted(() => vi.fn<(config?: unknown) => typeof client>(() => client));
vi.mock("@fal-ai/client", () => ({ createFalClient }));

import { createFalProvider } from "@/providers/ai/fal";

const API_KEY = "fal-test-key-secret-1234";
const MP = 1024 * 1024;

const trained: IdentityRef = {
  modelRef: "https://v3.fal.media/files/lora/abc.safetensors",
  triggerWord: "ohwx",
  subject: "man",
  referenceImageUrls: ["https://cdn.test/ref1.jpg", "https://cdn.test/ref2.jpg"],
};
const instant: IdentityRef = {
  modelRef: "",
  triggerWord: "ohwx",
  subject: "woman",
  referenceImageUrls: ["https://cdn.test/s1.jpg", "https://cdn.test/s2.jpg", "https://cdn.test/s3.jpg"],
};

function generateInput(over: Partial<GenerateInput> = {}): GenerateInput {
  return {
    prompt: "photo of ohwx man on a yacht at sunset",
    identity: trained,
    aspectRatio: "4:5",
    numImages: 2,
    quality: "standard",
    ...over,
  };
}

type SubmitCall = [string, { input: Record<string, unknown>; webhookUrl?: string; storageSettings?: unknown }];
function lastSubmit(): { endpoint: string; options: SubmitCall[1]; input: Record<string, unknown> } {
  const call = client.queue.submit.mock.calls.at(-1) as SubmitCall | undefined;
  if (!call) throw new Error("queue.submit was not called");
  return { endpoint: call[0], options: call[1], input: call[1].input };
}

function apiError(status: number, body: unknown, message = "Request failed"): Error {
  return Object.assign(new Error(message), { status, body });
}

beforeEach(() => {
  vi.clearAllMocks();
  client.queue.submit.mockResolvedValue({ request_id: "req-123", status: "IN_QUEUE", queue_position: 0 });
});

describe("factory", () => {
  it("is cheap: the SDK client is only created on first use, with the given credentials", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    expect(provider.name).toBe("fal");
    expect(createFalClient).not.toHaveBeenCalled();
    await provider.submitFaceRestore({ imageUrl: "https://cdn.test/a.jpg" });
    await provider.submitFaceRestore({ imageUrl: "https://cdn.test/b.jpg" });
    expect(createFalClient).toHaveBeenCalledTimes(1);
    expect(createFalClient).toHaveBeenCalledWith({ credentials: API_KEY });
  });

  it("requires an API key", () => {
    expect(() => createFalProvider({ apiKey: "" })).toThrow(/apiKey/);
  });
});

describe("submitGenerate (trained LoRA)", () => {
  it("submits flux-lora with the LoRA, the safety checker on and a webhook", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    const ref = await provider.submitGenerate(generateInput({ seed: 42 }), { webhookUrl: "https://app.test/api/webhooks/ai/fal" });

    expect(ref).toEqual({ provider: "fal", endpoint: MODELS.fal.generate.id, requestId: "req-123" });
    const { endpoint, options, input } = lastSubmit();
    expect(endpoint).toBe("fal-ai/flux-lora");
    expect(options.webhookUrl).toBe("https://app.test/api/webhooks/ai/fal");
    expect(input).toMatchObject({
      prompt: "photo of ohwx man on a yacht at sunset",
      loras: [{ path: trained.modelRef, scale: 1 }],
      image_size: { width: 896, height: 1120 },
      num_inference_steps: 28,
      num_images: 2,
      seed: 42,
      enable_safety_checker: true,
    });
    expect(input).not.toHaveProperty("acceleration");
  });

  it("omits the webhook when none is given (polling mode)", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitGenerate(generateInput());
    expect(lastSubmit().options).not.toHaveProperty("webhookUrl");
  });

  it.each(ASPECT_RATIOS)("standard %s stays <= 1 MP with sides in multiples of 16", async (aspectRatio) => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitGenerate(generateInput({ aspectRatio }));
    const { width, height } = lastSubmit().input.image_size as { width: number; height: number };
    expect(width * height).toBeLessThanOrEqual(MP);
    expect(width * height).toBeGreaterThan(0.7 * MP);
    expect(width % 16).toBe(0);
    expect(height % 16).toBe(0);
    const [rw, rh] = aspectRatio.split(":").map(Number) as [number, number];
    expect(width / height).toBeCloseTo(rw / rh, 2);
  });

  it.each(ASPECT_RATIOS)("high %s stays <= 2 MP and uses 40 steps", async (aspectRatio) => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitGenerate(generateInput({ aspectRatio, quality: "high" }));
    const input = lastSubmit().input;
    const { width, height } = input.image_size as { width: number; height: number };
    expect(width * height).toBeLessThanOrEqual(2 * MP);
    expect(width * height).toBeGreaterThan(MP);
    expect(input.num_inference_steps).toBe(40);
    expect(input.enable_safety_checker).toBe(true);
  });

  it("drafts use the draft endpoint, 512 px long side, 10 steps and acceleration", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    const ref = await provider.submitGenerate(generateInput({ quality: "draft", aspectRatio: "9:16" }));
    expect(ref.endpoint).toBe(MODELS.fal.draft.id);
    const input = lastSubmit().input;
    const { width, height } = input.image_size as { width: number; height: number };
    expect(Math.max(width, height)).toBeLessThanOrEqual(512);
    expect(input).toMatchObject({ num_inference_steps: 10, acceleration: "regular", enable_safety_checker: true });
  });

  it("ignores reference images on the LoRA path (no image-to-image endpoint configured)", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitGenerate(generateInput({ referenceImageUrl: "https://cdn.test/style.jpg", referenceStrength: 0.5 }));
    expect(JSON.stringify(lastSubmit().input)).not.toContain("style.jpg");
  });
});

describe("submitGenerate (instant mode)", () => {
  it("routes to the multi-image editor with the reference photos and strictest safety", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    const ref = await provider.submitGenerate(
      generateInput({ identity: instant, prompt: "photo of ohwx woman reading in a cafe", quality: "standard" }),
    );
    expect(ref.endpoint).toBe(MODELS.fal.editMulti.id);
    const input = lastSubmit().input;
    expect(input.image_urls).toEqual(instant.referenceImageUrls);
    expect(input).toMatchObject({ safety_tolerance: "1", aspect_ratio: "4:5", resolution: "1K", num_images: 2 });
    expect(input).not.toHaveProperty("loras");
    const prompt = input.prompt as string;
    expect(prompt).not.toContain("ohwx");
    expect(prompt).toContain("images 1-3");
    expect(prompt).toContain("reading in a cafe");
    expect(prompt).toMatch(/same woman/i);
  });

  it("adds a style reference after the identity photos", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitGenerate(generateInput({ identity: instant, referenceImageUrl: "https://cdn.test/style.jpg" }));
    const input = lastSubmit().input;
    expect(input.image_urls).toEqual([...instant.referenceImageUrls!, "https://cdn.test/style.jpg"]);
    expect(input.prompt).toContain("Image 4 is only a style and composition reference");
  });

  it("maps quality to Nano Banana resolution", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitGenerate(generateInput({ identity: instant, quality: "draft" }));
    expect(lastSubmit().input.resolution).toBe("0.5K");
    await provider.submitGenerate(generateInput({ identity: instant, quality: "high" }));
    expect(lastSubmit().input.resolution).toBe("2K");
  });

  it("fails without submitting when there is no LoRA and no reference photo", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    const err = await provider
      .submitGenerate(generateInput({ identity: { ...instant, referenceImageUrls: [] } }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderRequestError);
    expect((err as ProviderRequestError).retryable).toBe(false);
    expect(client.queue.submit).not.toHaveBeenCalled();
  });
});

describe("submitEdit", () => {
  it("instruct: source image first, identity refs next, instruction limited to the change", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitEdit({
      mode: "instruct",
      prompt: "change the shirt to a navy blazer",
      imageUrls: ["https://cdn.test/source.jpg"],
      identity: trained,
      numImages: 1,
    });
    const { endpoint, input } = lastSubmit();
    expect(endpoint).toBe(MODELS.fal.editMulti.id);
    expect(input.image_urls).toEqual(["https://cdn.test/source.jpg", ...trained.referenceImageUrls!]);
    expect(input).toMatchObject({ aspect_ratio: "auto", safety_tolerance: "1", num_images: 1 });
    const prompt = input.prompt as string;
    expect(prompt).toContain("Edit image 1: change the shirt to a navy blazer");
    expect(prompt).toMatch(/Change only what this instruction asks for/);
    expect(prompt).toContain("Images 2-3 are extra reference photos of the same man");
  });

  it("pose_copy: pose reference first, then the identity photos", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitEdit({
      mode: "pose_copy",
      prompt: "",
      imageUrls: ["https://cdn.test/pose.jpg"],
      identity: trained,
      aspectRatio: "2:3",
      numImages: 2,
    });
    const input = lastSubmit().input;
    expect(input.image_urls).toEqual(["https://cdn.test/pose.jpg", ...trained.referenceImageUrls!]);
    expect(input.aspect_ratio).toBe("2:3");
    expect(input.prompt).toContain("Image 1 is a pose and scene reference. Images 2-3 show the man to photograph.");
    expect(input.prompt).toMatch(/Do not keep any facial features of the person in image 1/);
  });

  it("pose_copy without reference photos is rejected before submitting", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await expect(
      provider.submitEdit({
        mode: "pose_copy",
        prompt: "",
        imageUrls: ["https://cdn.test/pose.jpg"],
        identity: { ...trained, referenceImageUrls: [] },
        numImages: 1,
      }),
    ).rejects.toMatchObject({ retryable: false });
    expect(client.queue.submit).not.toHaveBeenCalled();
  });

  it("multi_person: each person's photos form a labelled block; trigger words become labels", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    const friend: IdentityRef = { modelRef: "", triggerWord: "sks", subject: "woman", referenceImageUrls: ["https://cdn.test/f1.jpg"] };
    await provider.submitEdit({
      mode: "multi_person",
      prompt: "ohwx man and sks woman having coffee in Paris",
      imageUrls: [],
      identities: [trained, friend],
      aspectRatio: "4:5",
      numImages: 2,
    });
    const input = lastSubmit().input;
    expect(input.image_urls).toEqual([...trained.referenceImageUrls!, "https://cdn.test/f1.jpg"]);
    const prompt = input.prompt as string;
    expect(prompt).toContain("Images 1-2 show person A (an adult man).");
    expect(prompt).toContain("Image 3 shows person B (an adult woman).");
    expect(prompt).toContain("person A and person B having coffee in Paris");
    expect(prompt).not.toMatch(/ohwx|sks/);
  });

  it("multi_person needs two identities", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await expect(
      provider.submitEdit({ mode: "multi_person", prompt: "x", imageUrls: [], identities: [trained], numImages: 1 }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });
});

describe("other image endpoints", () => {
  it("inpaint uses the user's LoRA and adds the trigger phrase", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitInpaint({
      imageUrl: "https://cdn.test/img.jpg",
      maskUrl: "https://cdn.test/mask.png",
      prompt: "a red wool scarf",
      identity: trained,
    });
    const { endpoint, input } = lastSubmit();
    expect(endpoint).toBe(MODELS.fal.inpaint.id);
    expect(input).toMatchObject({
      image_url: "https://cdn.test/img.jpg",
      mask_url: "https://cdn.test/mask.png",
      prompt: "photo of ohwx man, a red wool scarf",
      loras: [{ path: trained.modelRef, scale: 1 }],
      enable_safety_checker: true,
    });
  });

  it("inpaint without a trained model sends no LoRA and strips trigger words", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitInpaint({
      imageUrl: "https://cdn.test/img.jpg",
      maskUrl: "https://cdn.test/mask.png",
      prompt: "ohwx woman wearing sunglasses",
      identity: instant,
    });
    const input = lastSubmit().input;
    expect(input).not.toHaveProperty("loras");
    expect(input.prompt).toBe("the woman wearing sunglasses");
  });

  it("upscale uses crystal with the scale factor", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitUpscale({ imageUrl: "https://cdn.test/img.jpg", scale: 4, faceRestore: true });
    const { endpoint, input } = lastSubmit();
    expect(endpoint).toBe(MODELS.fal.upscale.id);
    expect(input).toMatchObject({ image_url: "https://cdn.test/img.jpg", scale_factor: 4, enable_safety_checker: true });
  });

  it("face restore keeps CodeFormer fidelity >= 0.7", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitFaceRestore({ imageUrl: "https://cdn.test/img.jpg" });
    const { endpoint, input } = lastSubmit();
    expect(endpoint).toBe(MODELS.fal.faceRestore.id);
    expect(input.fidelity as number).toBeGreaterThanOrEqual(0.7);
  });

  it("background removal uses the BiRefNet Portrait model", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitRemoveBackground({ imageUrl: "https://cdn.test/img.jpg" });
    const { endpoint, input } = lastSubmit();
    expect(endpoint).toBe(MODELS.fal.removeBg.id);
    expect(input).toMatchObject({ image_url: "https://cdn.test/img.jpg", model: "Portrait" });
  });

  it.each(["auto", "tops", "bottoms", "one-pieces"] as const)("try-on maps category %s, balanced mode", async (category) => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitTryOn({ personImageUrl: "https://cdn.test/p.jpg", garmentImageUrl: "https://cdn.test/g.jpg", category });
    const { endpoint, input } = lastSubmit();
    expect(endpoint).toBe(MODELS.fal.tryOn.id);
    expect(input).toMatchObject({
      model_image: "https://cdn.test/p.jpg",
      garment_image: "https://cdn.test/g.jpg",
      category,
      mode: "balanced",
      moderation_level: "conservative",
      enable_safety_checker: true,
    });
  });
});

describe("training", () => {
  it("submits flux-lora-fast-training with masks on, a 1-day output lifetime and defaults", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    const ref = await provider.submitTraining(
      { imagesZipUrl: "https://cdn.test/selfies.zip", imageCount: 15, triggerWord: "ohwx", subject: "man" },
      { webhookUrl: "https://app.test/hook" },
    );
    expect(ref.endpoint).toBe(MODELS.fal.train.id);
    const { options, input } = lastSubmit();
    expect(input).toEqual({
      images_data_url: "https://cdn.test/selfies.zip",
      data_archive_format: "zip",
      trigger_word: "ohwx",
      steps: 1000,
      create_masks: true,
      is_style: false,
    });
    // fal can't delete files: the LoRA is copied into our storage at completion, fal's copy expires (SAF-7).
    expect(options.storageSettings).toEqual({ expiresIn: "1d" });
    expect(options.webhookUrl).toBe("https://app.test/hook");
  });

  it("honours a steps override within a safe range", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitTraining({ imagesZipUrl: "https://x.test/a.zip", imageCount: 10, triggerWord: "t", subject: "person", steps: 1500 });
    expect(lastSubmit().input.steps).toBe(1500);
    await provider.submitTraining({ imagesZipUrl: "https://x.test/a.zip", imageCount: 10, triggerWord: "t", subject: "person", steps: 99_999 });
    expect(lastSubmit().input.steps).toBe(4000);
  });

  it("deleteModel reports honestly that fal can't delete files (without leaking the LoRA URL)", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    const err = await provider.deleteModel(trained.modelRef).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProviderDeletionUnsupportedError);
    expect((err as Error).message).toMatch(/expires automatically/);
    expect((err as Error).message).not.toContain("abc.safetensors");
    expect(client.queue.submit).not.toHaveBeenCalled();
  });
});

describe("video", () => {
  it("image-to-video: kling v3 standard, duration string, audio off", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitImageToVideo({ imageUrl: "https://cdn.test/i.jpg", prompt: "she turns and laughs", durationSec: 10 });
    const { endpoint, input } = lastSubmit();
    expect(endpoint).toBe(MODELS.fal.imageToVideo.id);
    expect(input).toMatchObject({
      start_image_url: "https://cdn.test/i.jpg",
      duration: "10",
      generate_audio: false,
      enable_safety_checker: true,
    });
    expect(input.prompt).toContain("she turns and laughs");
  });

  it("image-to-video uses a default motion prompt when empty", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitImageToVideo({ imageUrl: "https://cdn.test/i.jpg", prompt: "  ", durationSec: 5 });
    expect(lastSubmit().input).toMatchObject({ duration: "5" });
    expect((lastSubmit().input.prompt as string).length).toBeGreaterThan(20);
  });

  it("talking video runs TTS synchronously, then queues the avatar with the audio URL", async () => {
    client.subscribe.mockResolvedValue({ data: { audio: { url: "https://cdn.test/speech.mp3" }, duration_ms: 4200 }, requestId: "tts-1" });
    const provider = createFalProvider({ apiKey: API_KEY });
    const ref = await provider.submitTalkingVideo(
      { imageUrl: "https://cdn.test/face.jpg", script: "Hi, I'm excited to join the team.", voice: "deep_male" },
      { webhookUrl: "https://app.test/hook" },
    );

    expect(client.subscribe).toHaveBeenCalledTimes(1);
    const [ttsEndpoint, ttsOpts] = client.subscribe.mock.calls[0] as [string, { input: Record<string, unknown> }];
    expect(ttsEndpoint).toBe(MODELS.fal.tts.id);
    expect(ttsOpts.input).toMatchObject({
      prompt: "Hi, I'm excited to join the team.",
      voice_setting: { voice_id: "Deep_Voice_Man" },
      output_format: "url",
    });

    expect(ref).toEqual({ provider: "fal", endpoint: MODELS.fal.talkingVideo.id, requestId: "req-123" });
    const { endpoint, options, input } = lastSubmit();
    expect(endpoint).toBe(MODELS.fal.talkingVideo.id);
    expect(options.webhookUrl).toBe("https://app.test/hook");
    expect(input).toMatchObject({ image_url: "https://cdn.test/face.jpg", audio_url: "https://cdn.test/speech.mp3" });
    expect(client.subscribe.mock.invocationCallOrder[0]!).toBeLessThan(client.queue.submit.mock.invocationCallOrder[0]!);
  });

  it.each([
    ["warm_female", "Wise_Woman"],
    ["bright_female", "Lively_Girl"],
    ["calm_male", "Patient_Man"],
    ["neutral", "Friendly_Person"],
    ["unknown_voice", "Friendly_Person"],
  ])("maps voice %s to %s", async (voice, voiceId) => {
    client.subscribe.mockResolvedValue({ data: { audio: { url: "https://cdn.test/a.mp3" } }, requestId: "t" });
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitTalkingVideo({ imageUrl: "https://cdn.test/f.jpg", script: "Hello there", voice });
    const ttsOpts = client.subscribe.mock.calls[0]![1] as { input: { voice_setting: { voice_id: string } } };
    expect(ttsOpts.input.voice_setting.voice_id).toBe(voiceId);
  });

  it("talking video does not queue the avatar when TTS fails or returns no audio", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    client.subscribe.mockRejectedValueOnce(apiError(500, { detail: "TTS backend down" }));
    await expect(
      provider.submitTalkingVideo({ imageUrl: "https://cdn.test/f.jpg", script: "Hello", voice: "neutral" }),
    ).rejects.toMatchObject({ retryable: true });
    client.subscribe.mockResolvedValueOnce({ data: { audio: null }, requestId: "t" });
    await expect(
      provider.submitTalkingVideo({ imageUrl: "https://cdn.test/f.jpg", script: "Hello", voice: "neutral" }),
    ).rejects.toMatchObject({ retryable: false });
    expect(client.queue.submit).not.toHaveBeenCalled();
  });

  it("refuses to animate speech longer than the job paid for (PAY-2), using the TTS duration", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    client.subscribe.mockResolvedValueOnce({ data: { audio: { url: "https://cdn.test/a.mp3" }, duration_ms: 95_000 }, requestId: "t" });
    await expect(
      provider.submitTalkingVideo({ imageUrl: "https://cdn.test/f.jpg", script: "こんにちは", voice: "neutral", maxAudioSeconds: 90 }),
    ).rejects.toMatchObject({ name: "AudioTooLongError", retryable: false, audioSeconds: 95, maxSeconds: 90 });
    expect(client.queue.submit).not.toHaveBeenCalled();

    client.subscribe.mockResolvedValueOnce({ data: { audio: { url: "https://cdn.test/a.mp3" }, duration_ms: 89_000 }, requestId: "t" });
    await provider.submitTalkingVideo({ imageUrl: "https://cdn.test/f.jpg", script: "Hello", voice: "neutral", maxAudioSeconds: 90 });
    expect(client.queue.submit).toHaveBeenCalledTimes(1);
  });
});

describe("safety checker is always on", () => {
  it("every queue submission to an endpoint with a checker sets enable_safety_checker: true", async () => {
    client.subscribe.mockResolvedValue({ data: { audio: { url: "https://cdn.test/a.mp3" } }, requestId: "t" });
    const provider = createFalProvider({ apiKey: API_KEY });
    await provider.submitGenerate(generateInput());
    await provider.submitGenerate(generateInput({ quality: "draft" }));
    await provider.submitGenerate(generateInput({ quality: "high" }));
    await provider.submitInpaint({ imageUrl: "https://a.test/i", maskUrl: "https://a.test/m", prompt: "x", identity: trained });
    await provider.submitUpscale({ imageUrl: "https://a.test/i", scale: 2, faceRestore: false });
    await provider.submitTryOn({ personImageUrl: "https://a.test/p", garmentImageUrl: "https://a.test/g", category: "auto" });
    await provider.submitImageToVideo({ imageUrl: "https://a.test/i", prompt: "", durationSec: 5 });
    await provider.submitTalkingVideo({ imageUrl: "https://a.test/i", script: "Hello", voice: "neutral" });

    const inputs = (client.queue.submit.mock.calls as SubmitCall[]).map((c) => c[1].input);
    expect(inputs).toHaveLength(8);
    for (const input of inputs) expect(input.enable_safety_checker).toBe(true);
    const tts = (client.subscribe.mock.calls[0] as [string, { input: Record<string, unknown> }])[1].input;
    expect(tts.enable_safety_checker).toBe(true);
  });
});

describe("getStatus", () => {
  const ref: ProviderJobRef = { provider: "fal", endpoint: MODELS.fal.generate.id, requestId: "req-9" };

  it("maps IN_QUEUE to queued with the position", async () => {
    client.queue.status.mockResolvedValue({ status: "IN_QUEUE", queue_position: 3, request_id: "req-9" });
    const provider = createFalProvider({ apiKey: API_KEY });
    await expect(provider.getStatus(ref)).resolves.toEqual({ state: "queued", position: 3 });
    expect(client.queue.status).toHaveBeenCalledWith(ref.endpoint, { requestId: "req-9", logs: true });
  });

  it("maps IN_PROGRESS to running with progress parsed from logs", async () => {
    client.queue.status.mockResolvedValue({
      status: "IN_PROGRESS",
      request_id: "req-9",
      logs: [
        { message: "Loading LoRA", level: "INFO", source: "USER", timestamp: "" },
        { message: " 50%|#####     | 14/28 [00:02<00:02]", level: "INFO", source: "USER", timestamp: "" },
      ],
    });
    const provider = createFalProvider({ apiKey: API_KEY });
    const st = await provider.getStatus(ref);
    expect(st).toMatchObject({ state: "running", progress: 50 });
    expect(st.state === "running" && st.logs).toHaveLength(2);
  });

  it("fetches and normalizes the flux result, including has_nsfw_concepts and seed", async () => {
    client.queue.status.mockResolvedValue({ status: "COMPLETED", request_id: "req-9", logs: [] });
    client.queue.result.mockResolvedValue({
      requestId: "req-9",
      data: {
        images: [
          { url: "https://v3.fal.media/a.jpg", width: 896, height: 1120, content_type: "image/jpeg" },
          { url: "https://v3.fal.media/b.jpg", width: 896, height: 1120, content_type: "image/jpeg" },
        ],
        has_nsfw_concepts: [false, true],
        seed: 1234,
        prompt: "x",
      },
    });
    const provider = createFalProvider({ apiKey: API_KEY });
    const st = await provider.getStatus(ref);
    expect(client.queue.result).toHaveBeenCalledWith(ref.endpoint, { requestId: "req-9" });
    expect(st.state).toBe("succeeded");
    if (st.state !== "succeeded") return;
    expect(st.output.seed).toBe(1234);
    expect(st.output.images).toEqual([
      { url: "https://v3.fal.media/a.jpg", width: 896, height: 1120, contentType: "image/jpeg", nsfw: false },
      { url: "https://v3.fal.media/b.jpg", width: 896, height: 1120, contentType: "image/jpeg", nsfw: true },
    ]);
  });

  it.each([
    ["training", { diffusers_lora_file: { url: "https://v3.fal.media/lora.safetensors" }, config_file: { url: "https://x/c.json" } }, { modelRef: "https://v3.fal.media/lora.safetensors" }],
    ["video", { video: { url: "https://v3.fal.media/v.mp4", content_type: "video/mp4" }, duration: 5.2 }, { videos: [{ url: "https://v3.fal.media/v.mp4", contentType: "video/mp4", durationSec: 5.2 }] }],
    ["single image (birefnet/codeformer)", { image: { url: "https://v3.fal.media/i.png", width: 10, height: 20, content_type: "null" } }, { images: [{ url: "https://v3.fal.media/i.png", width: 10, height: 20 }] }],
    ["tts audio", { audio: { url: "https://v3.fal.media/a.mp3" }, duration_ms: 1500 }, { audio: [{ url: "https://v3.fal.media/a.mp3", durationSec: 1.5 }] }],
  ])("normalizes %s output", async (_name, data, expected) => {
    client.queue.status.mockResolvedValue({ status: "COMPLETED", request_id: "r", logs: [] });
    client.queue.result.mockResolvedValue({ requestId: "r", data });
    const provider = createFalProvider({ apiKey: API_KEY });
    const st = await provider.getStatus(ref);
    expect(st.state).toBe("succeeded");
    if (st.state === "succeeded") expect(st.output).toMatchObject(expected);
  });

  it("treats a result with zero images as a non-retryable failure (provider refusal)", async () => {
    client.queue.status.mockResolvedValue({ status: "COMPLETED", request_id: "r", logs: [] });
    client.queue.result.mockResolvedValue({ requestId: "r", data: { images: [], description: "I can't help with that." } });
    const provider = createFalProvider({ apiKey: API_KEY });
    const st = await provider.getStatus({ ...ref, endpoint: MODELS.fal.editMulti.id });
    expect(st).toMatchObject({ state: "failed", retryable: false });
  });

  it("maps a completed-with-error status to failed without fetching the result", async () => {
    client.queue.status.mockResolvedValue({ status: "COMPLETED", request_id: "r", logs: [], error: "Request timed out", error_type: "request_timeout" });
    const provider = createFalProvider({ apiKey: API_KEY });
    await expect(provider.getStatus(ref)).resolves.toMatchObject({ state: "failed", retryable: true });
    expect(client.queue.result).not.toHaveBeenCalled();
  });

  it("maps a 422 result to a readable non-retryable failure", async () => {
    client.queue.status.mockResolvedValue({ status: "COMPLETED", request_id: "r", logs: [] });
    client.queue.result.mockRejectedValue(
      apiError(422, { detail: [{ loc: ["body", "image_size", "width"], msg: "Input should be less than 2048", type: "x" }] }),
    );
    const provider = createFalProvider({ apiKey: API_KEY });
    const st = await provider.getStatus(ref);
    expect(st).toEqual({ state: "failed", retryable: false, error: "fal rejected the input: image_size.width: Input should be less than 2048" });
  });

  it.each([500, 502, 429])("throws (so the engine re-polls) when fetching a finished result fails with HTTP %i", async (status) => {
    // The job finished at fal; a transient error fetching its result must not fail (and refund) it:
    // the engine treats every "failed" status as terminal.
    client.queue.status.mockResolvedValue({ status: "COMPLETED", request_id: "r", logs: [] });
    client.queue.result.mockRejectedValue(apiError(status, { detail: "Internal error" }));
    const provider = createFalProvider({ apiKey: API_KEY });
    await expect(provider.getStatus(ref)).rejects.toMatchObject({ name: "ProviderRequestError", retryable: true });
  });

  it.each([401, 403])("throws on HTTP %i (our API key, not the job, is the problem) instead of failing every running job", async (status) => {
    client.queue.status.mockRejectedValue(apiError(status, { detail: "Unauthorized" }));
    const provider = createFalProvider({ apiKey: API_KEY });
    await expect(provider.getStatus(ref)).rejects.toBeInstanceOf(ProviderRequestError);

    client.queue.status.mockResolvedValue({ status: "COMPLETED", request_id: "r", logs: [] });
    client.queue.result.mockRejectedValue(apiError(status, { detail: "Unauthorized" }));
    await expect(provider.getStatus(ref)).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("throws (so the engine re-polls) on network errors", async () => {
    client.queue.status.mockRejectedValue(new TypeError("fetch failed"));
    const provider = createFalProvider({ apiKey: API_KEY });
    await expect(provider.getStatus(ref)).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("maps an unknown request (404) to a non-retryable failure", async () => {
    client.queue.status.mockRejectedValue(apiError(404, { detail: "Request not found" }));
    const provider = createFalProvider({ apiKey: API_KEY });
    await expect(provider.getStatus(ref)).resolves.toMatchObject({ state: "failed", retryable: false });
  });
});

describe("errors, cancel, uploads, downloads", () => {
  it("maps submit validation errors to non-retryable ProviderRequestErrors without leaking the key", async () => {
    client.queue.submit.mockRejectedValueOnce(
      apiError(422, { detail: [{ loc: ["body", "num_images"], msg: "Input should be less than or equal to 4", type: "x" }] }),
    );
    const provider = createFalProvider({ apiKey: API_KEY });
    const err = (await provider.submitGenerate(generateInput({ numImages: 8 })).catch((e: unknown) => e)) as ProviderRequestError;
    expect(err).toBeInstanceOf(ProviderRequestError);
    expect(err.retryable).toBe(false);
    expect(err.status).toBe(422);
    expect(err.endpoint).toBe(MODELS.fal.generate.id);
    expect(err.message).toBe("fal rejected the input: num_images: Input should be less than or equal to 4");
    expect(err.message).not.toContain(API_KEY);
  });

  it("marks rate limits and server errors retryable, auth errors not", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    client.queue.submit.mockRejectedValueOnce(apiError(429, { detail: "Too many requests" }));
    await expect(provider.submitRemoveBackground({ imageUrl: "https://a.test/i" })).rejects.toMatchObject({ retryable: true });
    client.queue.submit.mockRejectedValueOnce(apiError(503, {}));
    await expect(provider.submitRemoveBackground({ imageUrl: "https://a.test/i" })).rejects.toMatchObject({ retryable: true });
    client.queue.submit.mockRejectedValueOnce(apiError(401, { detail: `bad key ${API_KEY}` }));
    const err = (await provider.submitRemoveBackground({ imageUrl: "https://a.test/i" }).catch((e: unknown) => e)) as Error;
    expect(err).toMatchObject({ retryable: false });
    expect(err.message).not.toContain(API_KEY);
  });

  it("cancel calls queue.cancel and explains requests that already finished", async () => {
    const provider = createFalProvider({ apiKey: API_KEY });
    const ref: ProviderJobRef = { provider: "fal", endpoint: MODELS.fal.imageToVideo.id, requestId: "v-1" };
    client.queue.cancel.mockResolvedValueOnce(undefined);
    await provider.cancel(ref);
    expect(client.queue.cancel).toHaveBeenCalledWith(ref.endpoint, { requestId: "v-1" });
    client.queue.cancel.mockRejectedValueOnce(apiError(400, { status: "ALREADY_COMPLETED" }));
    await expect(provider.cancel(ref)).rejects.toMatchObject({ retryable: false, message: expect.stringMatching(/already finished/) });
  });

  it("uploadInput uploads a File with a short lifecycle and returns the URL", async () => {
    client.storage.upload.mockResolvedValue("https://v3.fal.media/files/up.zip");
    const provider = createFalProvider({ apiKey: API_KEY });
    const url = await provider.uploadInput(new Uint8Array([1, 2, 3]), "application/zip", "selfies.zip");
    expect(url).toBe("https://v3.fal.media/files/up.zip");
    const [file, options] = client.storage.upload.mock.calls[0] as [File, unknown];
    expect(file).toBeInstanceOf(Blob);
    expect(file.type).toBe("application/zip");
    expect(file.name).toBe("selfies.zip");
    expect(file.size).toBe(3);
    expect(options).toEqual({ lifecycle: { expiresIn: "1d" } });
  });

  it("fetchOutput downloads bytes with the content type and enforces https + a size cap", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([9, 8, 7]), { headers: { "content-type": "image/jpeg; charset=binary" } }));
    const provider = createFalProvider({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    await expect(provider.fetchOutput("https://v3.fal.media/x.jpg")).resolves.toEqual({
      bytes: new Uint8Array([9, 8, 7]),
      contentType: "image/jpeg",
    });
    await expect(provider.fetchOutput("http://169.254.169.254/latest")).rejects.toThrow(/https/);

    fetchMock.mockImplementationOnce(
      async () => new Response("x", { headers: { "content-length": String(200 * 1024 * 1024) } }),
    );
    await expect(provider.fetchOutput("https://v3.fal.media/huge.mp4")).rejects.toThrow(/too large/);

    fetchMock.mockImplementationOnce(async () => new Response("nope", { status: 404 }));
    await expect(provider.fetchOutput("https://v3.fal.media/missing.jpg")).rejects.toThrow(/404/);
  });
});

describe("promptHelper", () => {
  const request = { request: "me on a yacht at sunset looking rich", subject: "man" as const };

  it("calls the LLM endpoint synchronously and parses its JSON answer", async () => {
    client.run.mockResolvedValue({
      requestId: "llm-1",
      data: {
        output:
          '```json\n{"prompt": "photo of {subject}, relaxed on the deck of a white yacht at golden hour, linen shirt", "negativePrompt": "blurry", "suggestions": ["Add a watch", "Try a wide shot"]}\n```',
      },
    });
    const provider = createFalProvider({ apiKey: API_KEY });
    const result = await provider.promptHelper(request);
    expect(result).toEqual({
      prompt: "photo of {subject}, relaxed on the deck of a white yacht at golden hour, linen shirt",
      negativePrompt: "blurry",
      suggestions: ["Add a watch", "Try a wide shot"],
    });
    const [endpoint, opts] = client.run.mock.calls[0] as [string, { input: Record<string, unknown> }];
    expect(endpoint).toBe(MODELS.fal.llm.id);
    expect(opts.input.model).toBe("google/gemini-3.1-flash-lite");
    expect(opts.input.system_prompt).toMatch(/\{subject\}/);
    expect(opts.input.system_prompt).toMatch(/celebrit/i);
    expect(opts.input.prompt).toContain("me on a yacht at sunset looking rich");
  });

  it("adds the {subject} placeholder when the LLM drops it", async () => {
    client.run.mockResolvedValue({ requestId: "l", data: { output: '{"prompt": "a man on a yacht", "suggestions": []}' } });
    const provider = createFalProvider({ apiKey: API_KEY });
    const result = await provider.promptHelper(request);
    expect(result.prompt).toBe("photo of {subject}, a man on a yacht");
  });

  it.each([
    ["the call throws", () => client.run.mockRejectedValue(new TypeError("fetch failed"))],
    ["the answer is not JSON", () => client.run.mockResolvedValue({ requestId: "l", data: { output: "Sure! Here is a prompt." } })],
    ["the router reports an error", () => client.run.mockResolvedValue({ requestId: "l", data: { output: "", error: "model overloaded" } })],
  ])("falls back to the deterministic template when %s", async (_case, arrange) => {
    arrange();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const provider = createFalProvider({ apiKey: API_KEY });
    const result = await provider.promptHelper(request);
    expect(result.prompt.startsWith("professional photo of {subject}, on a yacht at sunset looking rich")).toBe(true);
    expect(result.negativePrompt).toBeTruthy();
    expect(result.suggestions?.length).toBeGreaterThan(0);
    expect(warn.mock.calls.flat().join(" ")).not.toContain(API_KEY);
    warn.mockRestore();
  });
});
