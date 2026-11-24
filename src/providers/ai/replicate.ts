/**
 * Replicate adapter (alternate real AI provider). Async jobs are predictions; identity training uses
 * `trainings.create` into a private per-identity destination model. See docs/MODELS.md §A.2 and §B.
 *
 * The `replicate` SDK is imported lazily on first use, so constructing the provider is free.
 */
import "server-only";
import { MODELS } from "@/config/models";
import type {
  AIWebhookEvent,
  ImageProvider,
  ProviderJobRef,
  ProviderJobStatus,
  PromptHelperResult,
  SubmitOptions,
  TrainingProvider,
  VideoProvider,
  WebhookRequest,
} from "@/providers/types";
import { isRetryableStatus, ProviderRequestError } from "./shared/errors";
import { fetchOutputBytes } from "./shared/fetch-output";
import { parsePromptHelperOutput } from "./shared/prompt-helper";
import { buildTemplatePrompt } from "./shared/prompt-template";
import { apiErrorStatus, lazyReplicateClient, type ReplicateClient } from "./replicate/client";
import {
  editPlan,
  faceRestorePlan,
  generatePlan,
  imageToVideoPlan,
  inpaintPlan,
  promptHelperInput,
  removeBackgroundPlan,
  talkingAvatarPlan,
  trainingInput,
  tryOnPlan,
  ttsInput,
  upscalePlan,
  type PredictionPlan,
} from "./replicate/payloads";
import {
  decodeModelRef,
  decodeRequestId,
  DESTINATION_PREFIX,
  destinationName,
  encodeRequestId,
  splitModelId,
} from "./replicate/refs";
import {
  collectUrls,
  combineStatuses,
  contentTypeFromUrl,
  normalizeJob,
  outputKindFor,
  outputText,
  type ReplicateJobLike,
} from "./replicate/status";
import { createVersionResolver } from "./replicate/versions";
import { parseReplicateWebhook } from "./replicate/webhook";

const R = MODELS.replicate;
const PROVIDER = "replicate" as const;
const PROMPT_HELPER_TIMEOUT_MS = 20_000;
const TTS_WAIT_SEC = 60;

export interface ReplicateProviderOptions {
  apiToken: string;
  /** `whsec_...` signing secret (GET /v1/webhooks/default/secret). Required to accept webhooks. */
  webhookSecret?: string;
  /** Account/org that owns the private destination models created by training. */
  owner: string;
}

export function createReplicateProvider(
  opts: ReplicateProviderOptions,
): ImageProvider & TrainingProvider & VideoProvider {
  if (!opts.apiToken) throw new Error("Replicate provider requires an API token");
  if (!opts.owner) throw new Error("Replicate provider requires REPLICATE_OWNER");

  const getClient = lazyReplicateClient(opts.apiToken);
  const versions = createVersionResolver(getClient);

  /** Create every prediction of a plan; a webhook is only attached to single-prediction jobs. */
  async function submitPlan(plan: PredictionPlan, submit?: SubmitOptions): Promise<ProviderJobRef> {
    const endpoint = plan.spec.id;
    const client = await getClient();
    const target = await call(endpoint, () => versions.target(plan.spec));
    // A group's predictions finish separately and the engine maps a webhook to one request id, so groups are polled.
    const webhook =
      plan.inputs.length === 1 && submit?.webhookUrl
        ? { webhook: submit.webhookUrl, webhook_events_filter: ["completed" as const] }
        : {};

    const results = await Promise.allSettled(
      plan.inputs.map((input) => client.predictions.create({ ...target, input, ...webhook })),
    );
    const ids = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.id] : []));
    const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failure) {
      // Don't leave paid orphans running when part of a group failed to start.
      await Promise.allSettled(ids.map((id) => client.predictions.cancel(id)));
      throw toProviderError(failure.reason, endpoint);
    }
    return { provider: PROVIDER, endpoint, requestId: encodeRequestId({ kind: "group", ids }) };
  }

  async function predictionStatus(client: ReplicateClient, id: string, endpoint: string): Promise<ProviderJobStatus> {
    try {
      return normalizeJob(await client.predictions.get(id), outputKindFor(endpoint));
    } catch (err) {
      if (apiErrorStatus(err) === 404)
        return { state: "failed", error: "Replicate prediction not found", retryable: false };
      throw toProviderError(err, endpoint);
    }
  }

  async function ensureDestinationModel(client: ReplicateClient, name: string): Promise<void> {
    try {
      await client.models.create(opts.owner, name, { visibility: "private", hardware: "cpu" });
    } catch (err) {
      const status = apiErrorStatus(err);
      const exists = status === 409 || (status !== undefined && status < 500 && /already exists/i.test(errorText(err)));
      if (!exists) throw toProviderError(err, R.train.id);
    }
  }

  async function deleteIgnoringMissing(client: ReplicateClient, route: string): Promise<void> {
    try {
      await client.request(route, { method: "DELETE" });
    } catch (err) {
      if (apiErrorStatus(err) !== 404) throw toProviderError(err, R.train.id);
    }
  }

  const provider: ImageProvider & TrainingProvider & VideoProvider = {
    name: PROVIDER,

    /* ─────────────── AsyncAIProvider ─────────────── */

    async getStatus(ref: ProviderJobRef): Promise<ProviderJobStatus> {
      const client = await getClient();
      const parts = decodeRequestId(ref.requestId);
      if (parts.kind === "prediction") return predictionStatus(client, parts.id, ref.endpoint);
      if (parts.kind === "group") {
        return combineStatuses(await Promise.all(parts.ids.map((id) => predictionStatus(client, id, ref.endpoint))));
      }
      try {
        return normalizeJob((await client.trainings.get(parts.id)) as ReplicateJobLike, "training");
      } catch (err) {
        if (apiErrorStatus(err) === 404)
          return { state: "failed", error: "Replicate training not found", retryable: false };
        throw toProviderError(err, ref.endpoint);
      }
    },

    async cancel(ref: ProviderJobRef): Promise<void> {
      const client = await getClient();
      const parts = decodeRequestId(ref.requestId);
      await call(ref.endpoint, async () => {
        if (parts.kind === "training") await client.trainings.cancel(parts.id);
        else if (parts.kind === "prediction") await client.predictions.cancel(parts.id);
        else await Promise.all(parts.ids.map((id) => client.predictions.cancel(id)));
      });
    },

    async parseWebhook(req: WebhookRequest): Promise<AIWebhookEvent> {
      return parseReplicateWebhook(req, opts.webhookSecret);
    },

    async uploadInput(bytes: Uint8Array, contentType: string, filename?: string): Promise<string> {
      const client = await getClient();
      const file = new File([new Uint8Array(bytes)], filename ?? "input", { type: contentType });
      const created = await call("files", () => client.files.create(file));
      return created.urls.get;
    },

    async fetchOutput(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
      if (url.startsWith("data:")) return decodeDataUrl(url);
      const authFetch: typeof fetch = (input, init) => {
        // Files served by the API itself (e.g. uploads) need the token; CDN outputs must never receive it.
        const host = new URL(input instanceof Request ? input.url : String(input)).hostname;
        if (host !== "api.replicate.com") return fetch(input, init);
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${opts.apiToken}`);
        return fetch(input, { ...init, headers });
      };
      const out = await fetchOutputBytes(url, { fetch: authFetch });
      if (out.contentType === "application/octet-stream") {
        return { ...out, contentType: contentTypeFromUrl(url) ?? out.contentType };
      }
      return out;
    },

    /* ─────────────── Training ─────────────── */

    async submitTraining(input, submit) {
      const client = await getClient();
      const name = destinationName(input.triggerWord);
      await ensureDestinationModel(client, name);

      const trainerVersion = await call(R.train.id, () => versions.versionOf(R.train));
      if (!trainerVersion)
        throw new ProviderRequestError({
          provider: PROVIDER,
          message: "Trainer version is not configured",
          retryable: false,
        });
      const trainer = splitModelId(R.train.id);
      const training = await call(R.train.id, () =>
        client.trainings.create(trainer.owner, trainer.name, trainerVersion, {
          destination: `${opts.owner}/${name}`,
          input: trainingInput(input),
          ...(submit?.webhookUrl ? { webhook: submit.webhookUrl, webhook_events_filter: ["completed"] } : {}),
        }),
      );
      return {
        provider: PROVIDER,
        endpoint: R.train.id,
        requestId: encodeRequestId({ kind: "training", id: training.id }),
      };
    },

    /** Deletes every version of the identity's private destination model, then the model itself (404 = already gone). */
    async deleteModel(modelRef: string): Promise<void> {
      const parts = decodeModelRef(modelRef);
      if (!parts?.model) return; // weights-only / non-Replicate refs have nothing addressable to delete
      const { owner, name } = splitModelId(parts.model);
      // Never touch models this deployment did not create.
      if (owner !== opts.owner || !name.startsWith(DESTINATION_PREFIX)) return;

      const client = await getClient();
      const versionIds = new Set<string>(parts.version ? [parts.version] : []);
      try {
        for await (const page of client.paginate(() => client.models.versions.list(owner, name))) {
          for (const v of page) versionIds.add(v.id);
        }
      } catch (err) {
        if (apiErrorStatus(err) === 404) return; // model (and its versions) already deleted
        throw toProviderError(err, R.train.id);
      }
      for (const id of versionIds) {
        await deleteIgnoringMissing(client, `/models/${owner}/${name}/versions/${encodeURIComponent(id)}`);
      }
      await deleteIgnoringMissing(client, `/models/${owner}/${name}`);
    },

    /* ─────────────── Images ─────────────── */

    submitGenerate: async (input, submit) => submitPlan(generatePlan(input), submit),
    submitEdit: async (input, submit) => submitPlan(editPlan(input), submit),
    submitInpaint: async (input, submit) => submitPlan(inpaintPlan(input), submit),
    submitUpscale: async (input, submit) => submitPlan(upscalePlan(input), submit),
    submitFaceRestore: async (input, submit) => submitPlan(faceRestorePlan(input.imageUrl), submit),
    submitRemoveBackground: async (input, submit) => submitPlan(removeBackgroundPlan(input.imageUrl), submit),
    submitTryOn: async (input, submit) => submitPlan(tryOnPlan(input), submit),

    async promptHelper(input): Promise<PromptHelperResult> {
      try {
        const client = await getClient();
        const output = await withTimeout(
          client.run(R.llm.id, {
            input: promptHelperInput(input),
            wait: { mode: "block", timeout: PROMPT_HELPER_TIMEOUT_MS / 1000 },
            signal: AbortSignal.timeout(PROMPT_HELPER_TIMEOUT_MS),
          }),
          PROMPT_HELPER_TIMEOUT_MS + 2_000,
        );
        const parsed = parsePromptHelperOutput(outputText(output));
        if (parsed) return parsed;
      } catch {
        // Any LLM failure falls back to the deterministic template below.
      }
      return buildTemplatePrompt(input);
    },

    /* ─────────────── Video ─────────────── */

    submitImageToVideo: async (input, submit) => submitPlan(imageToVideoPlan(input), submit),

    /** TTS runs synchronously (seconds), then the avatar lip-sync prediction is queued with the audio URL. */
    async submitTalkingVideo(input, submit) {
      const client = await getClient();
      const speech = await call(R.tts.id, () =>
        client.run(R.tts.id, {
          input: ttsInput(input.script, input.voice),
          wait: { mode: "block", timeout: TTS_WAIT_SEC },
        }),
      );
      const audioUrl = collectUrls(speech)[0];
      if (!audioUrl)
        throw new ProviderRequestError({
          provider: PROVIDER,
          endpoint: R.tts.id,
          message: "Text-to-speech returned no audio",
          retryable: true,
        });
      return submitPlan(talkingAvatarPlan(input.imageUrl, audioUrl), submit);
    },
  };

  return provider;
}

/* ─────────────── helpers ─────────────── */

async function call<T>(endpoint: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toProviderError(err, endpoint);
  }
}

function toProviderError(err: unknown, endpoint: string): ProviderRequestError {
  if (err instanceof ProviderRequestError) return err;
  const status = apiErrorStatus(err);
  const text = errorText(err);
  const failedRun = status === undefined && /^Prediction failed/i.test(text);
  return new ProviderRequestError({
    provider: PROVIDER,
    endpoint,
    status,
    message: `Replicate request failed${status ? ` (HTTP ${status})` : ""}: ${text.slice(0, 500)}`,
    // A model run that reported failure is not a transport problem; retrying won't help.
    retryable: failedRun ? false : isRetryableStatus(status),
    cause: err,
  });
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function decodeDataUrl(url: string): { bytes: Uint8Array; contentType: string } {
  const m = /^data:([^;,]*)((?:;[^;,]*)*?),(.*)$/.exec(url);
  if (!m) throw new Error("Output is not a valid data URL.");
  const base64 = /;base64/i.test(m[2]);
  const bytes = base64 ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
  return { bytes: new Uint8Array(bytes), contentType: m[1] || "application/octet-stream" };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
