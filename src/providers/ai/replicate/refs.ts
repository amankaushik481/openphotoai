/**
 * String codecs for Replicate references persisted in our DB.
 *
 * Request ids (ProviderJobRef.requestId):
 *   "<predictionId>"           a single prediction
 *   "trn:<trainingId>"         a training (status/cancel go through the trainings API)
 *   "grp:<id1>,<id2>,..."      several predictions that together form one job (models without
 *                              `num_outputs`, or more images than the model allows per call)
 *
 * Model refs (TrainingProvider output `modelRef`, IdentityRef.modelRef):
 *   "<owner>/<name>:<version>"            destination model version created by the training
 *   "<owner>/<name>:<version>|<weights>"  ... plus the LoRA weights URL (preferred for generation)
 *   "<weightsUrl>"                        weights only (e.g. imported LoRA)
 */

const TRAINING_PREFIX = "trn:";
const GROUP_PREFIX = "grp:";

export type RequestIdParts =
  | { kind: "prediction"; id: string }
  | { kind: "training"; id: string }
  | { kind: "group"; ids: string[] };

export function encodeRequestId(parts: RequestIdParts): string {
  switch (parts.kind) {
    case "prediction":
      return parts.id;
    case "training":
      return `${TRAINING_PREFIX}${parts.id}`;
    case "group":
      return parts.ids.length === 1 ? parts.ids[0] : `${GROUP_PREFIX}${parts.ids.join(",")}`;
  }
}

export function decodeRequestId(requestId: string): RequestIdParts {
  if (requestId.startsWith(TRAINING_PREFIX)) return { kind: "training", id: requestId.slice(TRAINING_PREFIX.length) };
  if (requestId.startsWith(GROUP_PREFIX)) {
    const ids = requestId.slice(GROUP_PREFIX.length).split(",").filter(Boolean);
    if (ids.length === 0) throw new Error(`Invalid Replicate group request id: ${requestId}`);
    return { kind: "group", ids };
  }
  if (!requestId) throw new Error("Empty Replicate request id");
  return { kind: "prediction", id: requestId };
}

export interface ModelRefParts {
  /** "owner/name" of the destination model, when known. */
  model?: string;
  version?: string;
  /** LoRA weights URL usable as flux-dev-lora `lora_weights`. */
  weights?: string;
}

const MODEL_VERSION_RE = /^([a-z0-9][a-z0-9._-]*)\/([a-z0-9][a-z0-9._-]*):([a-z0-9]{8,128})$/i;

export function encodeModelRef(parts: ModelRefParts): string {
  const base = parts.model && parts.version ? `${parts.model}:${parts.version}` : "";
  if (base && parts.weights) return `${base}|${parts.weights}`;
  if (base) return base;
  if (parts.weights) return parts.weights;
  throw new Error("Cannot encode an empty Replicate model reference");
}

/** Parses a model ref. Returns null for refs that are not Replicate LoRA references (e.g. instant-mode refs). */
export function decodeModelRef(ref: string | undefined | null): ModelRefParts | null {
  const value = ref?.trim();
  if (!value) return null;
  const pipe = value.indexOf("|");
  const head = pipe === -1 ? value : value.slice(0, pipe);
  const tail = pipe === -1 ? undefined : value.slice(pipe + 1);

  if (isHttpsUrl(head) && tail === undefined) return { weights: head };
  const m = MODEL_VERSION_RE.exec(head);
  if (!m) return null;
  const parts: ModelRefParts = { model: `${m[1]}/${m[2]}`, version: m[3] };
  if (tail && isHttpsUrl(tail)) parts.weights = tail;
  return parts;
}

/** Value for flux-dev-lora `lora_weights`: the weights URL, else the "owner/name/version" form. */
export function loraWeightsFor(parts: ModelRefParts): string | null {
  if (parts.weights) return parts.weights;
  if (parts.model && parts.version) return `${parts.model}/${parts.version}`;
  return null;
}

export const DESTINATION_PREFIX = "openshoot-";

/** Replicate model names allow lowercase letters, digits, dashes, underscores and periods. */
export function destinationName(triggerWord: string): string {
  const slug = triggerWord
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 60);
  if (!slug) throw new Error("Trigger word produced an empty Replicate model name");
  return `${DESTINATION_PREFIX}${slug}`;
}

export function splitModelId(id: string): { owner: string; name: string } {
  const [owner, name, ...rest] = id.split("/");
  if (!owner || !name || rest.length > 0) throw new Error(`Invalid Replicate model id: ${id}`);
  return { owner, name };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
