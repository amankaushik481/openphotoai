/**
 * fal.ai adapter (default real AI provider). Implements image, training and video providers on fal's queue
 * API; endpoint ids come from MODELS.fal (src/config/models.ts) and request shapes from ./fal/inputs.
 *
 * The factory is cheap: the SDK is imported lazily and nothing touches the network until a method runs.
 * The API key is only handed to the SDK client and is never logged or put into error messages.
 */
import "server-only";
import type { QueueStatus, StorageSettings } from "@fal-ai/client";
import { MODELS, type Capability } from "@/config/models";
import type {
  AIWebhookEvent,
  ImageProvider,
  ProviderJobRef,
  ProviderJobStatus,
  PromptHelperResult,
  SubmitOptions,
  TrainingProvider,
  VideoProvider,
} from "@/providers/types";
import { AudioTooLongError, ProviderRequestError } from "@/providers/ai/shared/errors";
import { fetchOutputBytes } from "@/providers/ai/shared/fetch-output";
import { parsePromptHelperOutput } from "@/providers/ai/shared/prompt-helper";
import { buildTemplatePrompt } from "@/providers/ai/shared/prompt-template";
import { createFalClientLoader, describeFalError, isRetryableFailureText, toProviderError } from "./fal/client";
import {
  buildAvatarInput,
  buildEditInput,
  buildFaceRestoreInput,
  buildImageToVideoInput,
  buildInpaintInput,
  buildInstantGenerateInput,
  buildLlmInput,
  buildLoraGenerateInput,
  buildRemoveBackgroundInput,
  buildTrainingInput,
  buildTryOnInput,
  buildTtsInput,
  buildUpscaleInput,
  generateCapability,
  llmModelSlug,
} from "./fal/inputs";
import { completedErrorText, completedStatus, pendingStatus } from "./fal/normalize";
import { createJwksCache, parseFalWebhook } from "./fal/webhook";

export interface FalProviderOptions {
  apiKey: string;
  /** Test seams; production uses the globals. */
  fetch?: typeof fetch;
  now?: () => number;
  jwksUrl?: string;
}

/** Generated outputs are copied into our storage within minutes; 7 days leaves room for slow polling. */
const OUTPUT_LIFECYCLE: StorageSettings = { expiresIn: "7d" };
/** The trained LoRA file *is* the identity model (modelRef): it must not expire. */
const MODEL_LIFECYCLE: StorageSettings = { expiresIn: "never" };
/** Inputs we upload (selfie zips, references) only need to live until the job has read them. */
const INPUT_LIFECYCLE: StorageSettings = { expiresIn: "1d" };

const TTS_TIMEOUT_MS = 90_000;
const LLM_TIMEOUT_MS = 15_000;

export function createFalProvider(opts: FalProviderOptions): ImageProvider & TrainingProvider & VideoProvider {
  if (!opts.apiKey) throw new Error("createFalProvider: apiKey is required (set FAL_KEY).");

  const getClient = createFalClientLoader(opts.apiKey);
  const now = opts.now ?? (() => Date.now());
  const doFetch: typeof fetch = opts.fetch ?? ((input, init) => fetch(input, init));
  const jwks = createJwksCache({ fetch: doFetch, now, url: opts.jwksUrl });

  async function submit(
    capability: Capability,
    input: Record<string, unknown>,
    submitOpts?: SubmitOptions,
    storageSettings: StorageSettings = OUTPUT_LIFECYCLE,
  ): Promise<ProviderJobRef> {
    // Widened to string: inputs are already typed per endpoint by the builders in ./fal/inputs.
    const endpoint: string = MODELS.fal[capability].id;
    try {
      const client = await getClient();
      const queued = await client.queue.submit(endpoint, {
        input,
        ...(submitOpts?.webhookUrl ? { webhookUrl: submitOpts.webhookUrl } : {}),
        storageSettings,
        tags: { app: "openshoot", capability },
      });
      return { provider: "fal", endpoint, requestId: queued.request_id };
    } catch (err) {
      throw toProviderError(err, endpoint);
    }
  }

  async function resultStatus(ref: ProviderJobRef): Promise<ProviderJobStatus> {
    const client = await getClient();
    try {
      const { data } = await client.queue.result(ref.endpoint, { requestId: ref.requestId });
      return completedStatus(data);
    } catch (err) {
      const info = describeFalError(err);
      // No HTTP status = transport problem fetching a finished result: let the engine poll again.
      if (info.status === undefined) throw toProviderError(err, ref.endpoint);
      if (/cancel/i.test(info.message)) return { state: "canceled" };
      return { state: "failed", error: info.message, retryable: info.retryable };
    }
  }

  return {
    name: "fal",

    async getStatus(ref) {
      const client = await getClient();
      let st: QueueStatus;
      try {
        st = await client.queue.status(ref.endpoint, { requestId: ref.requestId, logs: true });
      } catch (err) {
        const info = describeFalError(err);
        if (info.retryable) throw toProviderError(err, ref.endpoint);
        return { state: "failed", error: info.message, retryable: false };
      }
      const pending = pendingStatus(st);
      if (pending) return pending;
      const error = completedErrorText(st);
      if (error) {
        if (/cancel/i.test(error)) return { state: "canceled" };
        return { state: "failed", error, retryable: isRetryableFailureText(error) };
      }
      return resultStatus(ref);
    },

    async cancel(ref) {
      try {
        const client = await getClient();
        await client.queue.cancel(ref.endpoint, { requestId: ref.requestId });
      } catch (err) {
        const info = describeFalError(err);
        if (info.status === 400) {
          throw new ProviderRequestError({
            provider: "fal",
            endpoint: ref.endpoint,
            status: 400,
            retryable: false,
            message: "The fal request already finished and can't be canceled.",
            cause: err,
          });
        }
        throw toProviderError(err, ref.endpoint);
      }
    },

    async parseWebhook(req): Promise<AIWebhookEvent> {
      return parseFalWebhook(req, { jwks, now });
    },

    async uploadInput(bytes, contentType, filename) {
      try {
        const client = await getClient();
        const file = new File([new Uint8Array(bytes)], filename ?? "input", { type: contentType });
        return await client.storage.upload(file, { lifecycle: INPUT_LIFECYCLE });
      } catch (err) {
        throw toProviderError(err, "fal-storage");
      }
    },

    async fetchOutput(url) {
      return fetchOutputBytes(url, { fetch: doFetch });
    },

    /* ───────────── Training ───────────── */

    async submitTraining(input, submitOpts) {
      return submit("train", buildTrainingInput(input), submitOpts, MODEL_LIFECYCLE);
    },

    async deleteModel(modelRef) {
      // fal has no API to delete a trained LoRA file (docs/MODELS.md lists none); it lives at an unguessable
      // CDN URL. Our own copies and references are removed by the models service. Best-effort no-op.
      let host = "unknown host";
      try {
        host = new URL(modelRef).host;
      } catch {
        /* not a URL */
      }
      console.info(`[fal] deleteModel: provider-side LoRA files cannot be deleted via API (${host}); skipping.`);
    },

    /* ───────────── Images ───────────── */

    async submitGenerate(input, submitOpts) {
      const capability = generateCapability(input);
      if (capability === "editMulti") return submit(capability, buildInstantGenerateInput(input), submitOpts);
      return submit(capability, buildLoraGenerateInput(input), submitOpts);
    },

    async submitEdit(input, submitOpts) {
      return submit("editMulti", buildEditInput(input), submitOpts);
    },

    async submitInpaint(input, submitOpts) {
      return submit("inpaint", buildInpaintInput(input), submitOpts);
    },

    async submitUpscale(input, submitOpts) {
      return submit("upscale", buildUpscaleInput(input), submitOpts);
    },

    async submitFaceRestore(input, submitOpts) {
      return submit("faceRestore", buildFaceRestoreInput(input.imageUrl), submitOpts);
    },

    async submitRemoveBackground(input, submitOpts) {
      return submit("removeBg", buildRemoveBackgroundInput(input.imageUrl), submitOpts);
    },

    async submitTryOn(input, submitOpts) {
      return submit("tryOn", buildTryOnInput(input), submitOpts);
    },

    async promptHelper(input): Promise<PromptHelperResult> {
      const model = llmModelSlug();
      if (model) {
        try {
          const client = await getClient();
          const { data } = await client.run(MODELS.fal.llm.id, {
            input: buildLlmInput(model, input),
            abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
          });
          if (typeof data?.output === "string" && !data.error) {
            const parsed = parsePromptHelperOutput(data.output);
            if (parsed) return parsed;
          }
          console.warn("[fal] promptHelper: unusable LLM answer; using the template.");
        } catch (err) {
          console.warn(`[fal] promptHelper failed; using the template: ${describeFalError(err).message}`);
        }
      }
      return buildTemplatePrompt(input);
    },

    /* ───────────── Video ───────────── */

    async submitImageToVideo(input, submitOpts) {
      return submit("imageToVideo", buildImageToVideoInput(input), submitOpts);
    },

    async submitTalkingVideo(input, submitOpts) {
      // Step 1 (synchronous): text-to-speech. Step 2: queue the lip-sync avatar job and return its ref.
      const ttsEndpoint = MODELS.fal.tts.id;
      let audioUrl: string | undefined;
      let durationMs: number | undefined;
      try {
        const client = await getClient();
        const { data } = await client.subscribe(ttsEndpoint, {
          input: buildTtsInput(input),
          timeout: TTS_TIMEOUT_MS,
          storageSettings: OUTPUT_LIFECYCLE,
          tags: { app: "openshoot", capability: "tts" },
        });
        audioUrl = data?.audio?.url;
        durationMs = data?.duration_ms;
      } catch (err) {
        throw toProviderError(err, ttsEndpoint);
      }
      if (!audioUrl) {
        throw new ProviderRequestError({
          provider: "fal",
          endpoint: ttsEndpoint,
          retryable: false,
          message: "Text-to-speech returned no audio.",
        });
      }
      // The avatar model bills per second of audio: never animate more speech than the job paid for.
      if (input.maxAudioSeconds !== undefined && typeof durationMs === "number" && durationMs > input.maxAudioSeconds * 1000) {
        throw new AudioTooLongError({
          provider: "fal",
          endpoint: ttsEndpoint,
          audioSeconds: durationMs / 1000,
          maxSeconds: input.maxAudioSeconds,
        });
      }
      return submit("talkingVideo", buildAvatarInput(input.imageUrl, audioUrl), submitOpts);
    },
  };
}
