/**
 * The public API v1 operation table: the single source of truth for paths, required API key
 * scopes, parameters and response shapes. Route handlers take their operation from here
 * (`v1Route(v1Operations.listJobs, …)`), and the OpenAPI document + /docs/api are generated from it.
 */
import type { z } from "zod";
import { ref } from "./dto-schemas";
import {
  batchExample,
  createBatchExample,
  createJobExamples,
  ledgerExample,
  mediaExample,
  modelExample,
  packExample,
  readinessExample,
  runningJobExample,
  succeededJobExample,
  trainingPhotoExample,
} from "./examples";
import { v1CreditsQuery, v1GetModelQuery, v1ListJobsQuery, v1ListMediaQuery } from "./queries";
import type { ExampleObject, HttpMethod, JsonSchema } from "./types";

export type V1Scope = "read" | "generate";
export type V1Tag = "Models" | "Jobs" | "Batches" | "Media" | "Packs" | "Credits" | "Meta";
export type ErrorStatus = 400 | 401 | 402 | 403 | 404 | 409 | 422 | 429 | 502;

export interface V1Operation {
  operationId: string;
  method: HttpMethod;
  /** OpenAPI path template relative to the `/api/v1` server URL, e.g. "/jobs/{id}". */
  path: string;
  tag: V1Tag;
  summary: string;
  /** CommonMark (the docs page renders `code` spans). */
  description: string;
  /** Scope the API key needs (`*` keys have every scope); null = public. */
  scope: V1Scope | null;
  pathParams?: Record<string, string>;
  query?: { schema: z.ZodObject; docs: Record<string, string> };
  /** Accepts an `Idempotency-Key` header. */
  idempotencyKey?: boolean;
  body?: { schema: string; description: string; examples: Record<string, ExampleObject> };
  response: { description: string; schema: JsonSchema; example?: unknown };
  /** Error statuses besides the ones every authenticated call can return (401, 403, 429). */
  errors: ErrorStatus[];
}

export type ScopedV1Operation = V1Operation & { scope: V1Scope };

/** Object schema; every property is required unless listed in `optional`. */
function obj(properties: Record<string, JsonSchema>, optional: string[] = []): JsonSchema {
  return { type: "object", properties, required: Object.keys(properties).filter((k) => !optional.includes(k)) };
}
const list = (name: string): JsonSchema => ({ type: "array", items: ref(name) });
const cursor: JsonSchema = {
  type: ["string", "null"],
  description: "Pass as `cursor` to fetch the next page; null on the last page.",
};

const ID_PARAM = (what: string) => ({ id: `${what} id.` });

const jobsQueryDocs = {
  status: "Only jobs with this status.",
  type: "Only jobs of this type.",
  limit: "Page size (1-100).",
  cursor: "`nextCursor` from the previous page.",
  ids: "Comma-separated job ids (max 50) to poll several jobs at once; running ones are synced with the provider.",
};

const mediaQueryDocs = {
  folderId: "Only media in this gallery folder.",
  favorite: "`true` = favorites only, `false` = non-favorites only.",
  kind: "`image` or `video`.",
  modelId: "Only media made with this identity model.",
  packId: "Only media generated from this pack.",
  batchId: "Only media from this batch.",
  showHidden: "Include outputs hidden by the best-shots picker (default `false`).",
  limit: "Page size (1-100, default 40).",
  cursor: "`nextCursor` from the previous page.",
};

export const v1Operations = {
  listModels: {
    operationId: "listModels",
    method: "get",
    path: "/models",
    tag: "Models",
    summary: "List identity models",
    description:
      "Your identity models plus models other people shared with you through an accepted multi-person invite (`shared: true`). Create and train models in the web app.",
    scope: "read",
    response: {
      description: "Your models, newest first, followed by shared models.",
      schema: obj({ models: list("IdentityModel") }),
      example: { models: [modelExample] },
    },
    errors: [],
  },
  getModel: {
    operationId: "getModel",
    method: "get",
    path: "/models/{id}",
    tag: "Models",
    summary: "Get an identity model",
    description:
      "One of your models with its training photos and readiness, or a model shared with you (without the owner's photos).",
    scope: "read",
    pathParams: ID_PARAM("Model"),
    query: {
      schema: v1GetModelQuery,
      docs: { mode: "Compute `readiness` for this identity mode instead of the model's own." },
    },
    response: {
      description: "The model, its training photos and readiness.",
      schema: obj({
        model: ref("IdentityModel"),
        photos: list("TrainingPhoto"),
        readiness: ref("Readiness"),
        readinessByMode: obj({ instant: ref("Readiness"), trained: ref("Readiness") }),
      }),
      example: {
        model: modelExample,
        photos: [trainingPhotoExample],
        readiness: readinessExample,
        readinessByMode: { instant: readinessExample, trained: readinessExample },
      },
    },
    errors: [400, 404],
  },
  createJob: {
    operationId: "createJob",
    method: "post",
    path: "/jobs",
    tag: "Jobs",
    summary: "Create a job",
    description:
      "Start a generation, edit, upscale, video, try-on or multi-person job. Credits are charged up front and refunded automatically when the job fails, is canceled or its outputs are blocked. The response usually has status `running`; poll `GET /jobs/{id}` until it is terminal. Send an `Idempotency-Key` header to make retries safe.",
    scope: "generate",
    idempotencyKey: true,
    body: {
      schema: "CreateJobRequest",
      description: "Discriminated by `type`.",
      examples: createJobExamples,
    },
    response: { description: "The created job (or the original job for a replayed Idempotency-Key).", schema: obj({ job: ref("Job") }), example: { job: runningJobExample } },
    errors: [400, 402, 404, 409, 422, 502],
  },
  listJobs: {
    operationId: "listJobs",
    method: "get",
    path: "/jobs",
    tag: "Jobs",
    summary: "List jobs",
    description: "Your jobs, newest first, with cursor pagination. Includes jobs created in the web app.",
    scope: "read",
    query: { schema: v1ListJobsQuery, docs: jobsQueryDocs },
    response: {
      description: "A page of jobs.",
      schema: obj({ jobs: list("Job"), nextCursor: cursor }),
      example: { jobs: [succeededJobExample], nextCursor: null },
    },
    errors: [400],
  },
  getJob: {
    operationId: "getJob",
    method: "get",
    path: "/jobs/{id}",
    tag: "Jobs",
    summary: "Get a job",
    description:
      "Job status and results. A running job is synced with the AI provider when its last check is older than a few seconds, so polling this endpoint every 2-5 s is enough to drive a job to completion.",
    scope: "read",
    pathParams: ID_PARAM("Job"),
    response: { description: "The job.", schema: obj({ job: ref("Job") }), example: { job: succeededJobExample } },
    errors: [404],
  },
  cancelJob: {
    operationId: "cancelJob",
    method: "post",
    path: "/jobs/{id}/cancel",
    tag: "Jobs",
    summary: "Cancel a job",
    description: "Cancel a queued or running job; its credits are refunded. Finished jobs are returned unchanged.",
    scope: "generate",
    pathParams: ID_PARAM("Job"),
    response: {
      description: "The job after cancellation.",
      schema: obj({ job: ref("Job") }),
      example: {
        job: {
          ...runningJobExample,
          status: "canceled",
          error: "Canceled. Your credits were refunded.",
          errorCode: "canceled",
          creditsRefunded: 4,
          completedAt: "2026-05-01T12:00:05.000Z",
        },
      },
    },
    errors: [404],
  },
  createBatch: {
    operationId: "createBatch",
    method: "post",
    path: "/batches",
    tag: "Batches",
    summary: "Create a batch",
    description:
      "One pack → many images: creates `count` single-image generate jobs spread over the pack's prompts. If credits run out part-way, the batch shrinks to the jobs that were created (`requested` vs `batch.total`, `stoppedReason`).",
    scope: "generate",
    body: {
      schema: "CreateBatchRequest",
      description: "The pack, model and number of images.",
      examples: { batch: createBatchExample },
    },
    response: {
      description: "The batch and its jobs.",
      schema: obj({
        batch: ref("Batch"),
        jobs: list("Job"),
        requested: { type: "integer", description: "Images requested (`count`)." },
        stoppedReason: {
          type: ["string", "null"],
          enum: ["insufficient_credits", "error", null],
          description: "Why fewer jobs than requested were created, if so.",
        },
      }),
      example: { batch: batchExample, jobs: [runningJobExample], requested: 20, stoppedReason: null },
    },
    errors: [400, 402, 404, 409, 422, 502],
  },
  getBatch: {
    operationId: "getBatch",
    method: "get",
    path: "/batches/{id}",
    tag: "Batches",
    summary: "Get a batch",
    description: "Batch progress and its jobs (running jobs are synced with the provider).",
    scope: "read",
    pathParams: ID_PARAM("Batch"),
    response: {
      description: "The batch and its jobs, oldest first.",
      schema: obj({ batch: ref("Batch"), jobs: list("Job") }),
      example: { batch: batchExample, jobs: [succeededJobExample] },
    },
    errors: [404],
  },
  listMedia: {
    operationId: "listMedia",
    method: "get",
    path: "/media",
    tag: "Media",
    summary: "List media",
    description: "Your gallery (photos and videos), newest first, with filters and cursor pagination.",
    scope: "read",
    query: { schema: v1ListMediaQuery, docs: mediaQueryDocs },
    response: {
      description: "A page of media.",
      schema: obj(
        {
          media: list("Media"),
          nextCursor: cursor,
          hiddenCount: {
            type: "integer",
            description: "Media hidden by the best-shots picker that match the other filters (first page only).",
          },
        },
        ["hiddenCount"],
      ),
      example: { media: [mediaExample], nextCursor: null, hiddenCount: 2 },
    },
    errors: [400],
  },
  getMedia: {
    operationId: "getMedia",
    method: "get",
    path: "/media/{id}",
    tag: "Media",
    summary: "Get a media item",
    description: "One photo or video with fresh signed URLs.",
    scope: "read",
    pathParams: ID_PARAM("Media"),
    response: { description: "The media item.", schema: obj({ media: ref("Media") }), example: { media: mediaExample } },
    errors: [404],
  },
  listPacks: {
    operationId: "listPacks",
    method: "get",
    path: "/packs",
    tag: "Packs",
    summary: "List photo packs",
    description: "Every themed photo pack. Pass a pack's `slug` as `packId` when creating jobs or batches.",
    scope: "read",
    response: { description: "All packs.", schema: obj({ packs: list("PackSummary") }), example: { packs: [packExample] } },
    errors: [],
  },
  getCredits: {
    operationId: "getCredits",
    method: "get",
    path: "/credits",
    tag: "Credits",
    summary: "Get credit balance",
    description: "Current credit balance and the credit ledger (newest first).",
    scope: "read",
    query: {
      schema: v1CreditsQuery,
      docs: { cursor: "`nextCursor` from the previous page.", limit: "Page size (1-100, default 20)." },
    },
    response: {
      description: "Balance and a page of ledger entries.",
      schema: obj({
        balance: { type: "integer", description: "Credits available." },
        ledger: list("CreditLedgerEntry"),
        nextCursor: cursor,
      }),
      example: { balance: 596, ledger: [ledgerExample], nextCursor: null },
    },
    errors: [400],
  },
  getOpenApiDocument: {
    operationId: "getOpenApiDocument",
    method: "get",
    path: "/openapi.json",
    tag: "Meta",
    summary: "OpenAPI document",
    description: "This API's OpenAPI 3.1 document. No API key needed.",
    scope: null,
    response: { description: "OpenAPI 3.1 document.", schema: { type: "object", description: "OpenAPI 3.1 document." } },
    errors: [],
  },
} satisfies Record<string, V1Operation>;

export type V1OperationName = keyof typeof v1Operations;

export const V1_TAGS: { name: V1Tag; description: string }[] = [
  { name: "Jobs", description: "Generate, edit, upscale and animate photos. Every job charges credits and refunds failures." },
  { name: "Batches", description: "One pack → up to 50 images in one call." },
  { name: "Media", description: "Your gallery: generated photos and videos with signed download URLs." },
  { name: "Models", description: "Your identity models (create and train them in the web app)." },
  { name: "Packs", description: "Themed prompt packs." },
  { name: "Credits", description: "Credit balance and ledger." },
  { name: "Meta", description: "API metadata." },
];
