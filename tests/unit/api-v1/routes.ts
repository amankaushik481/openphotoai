/** Public API v1 route handlers keyed by operationId (see src/server/openapi/operations.ts). */
import type { NextRequest } from "next/server";
import { GET as getBatch } from "@/app/api/v1/batches/[id]/route";
import { POST as createBatch } from "@/app/api/v1/batches/route";
import { GET as getCredits } from "@/app/api/v1/credits/route";
import { POST as cancelJob } from "@/app/api/v1/jobs/[id]/cancel/route";
import { GET as getJob } from "@/app/api/v1/jobs/[id]/route";
import { GET as listJobs, POST as createJob } from "@/app/api/v1/jobs/route";
import { GET as getMedia } from "@/app/api/v1/media/[id]/route";
import { GET as listMedia } from "@/app/api/v1/media/route";
import { GET as getModel } from "@/app/api/v1/models/[id]/route";
import { GET as listModels } from "@/app/api/v1/models/route";
import { GET as getOpenApiDocument } from "@/app/api/v1/openapi.json/route";
import { GET as listPacks } from "@/app/api/v1/packs/route";
import { POST as createUpload } from "@/app/api/v1/uploads/route";
import type { V1OperationName } from "@/server/openapi/operations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- handlers differ only in their params type
type AnyHandler = (req: NextRequest, ctx: { params: Promise<any> }) => Promise<Response>;

export const V1_HANDLERS: Record<V1OperationName, AnyHandler> = {
  listModels,
  getModel,
  createJob,
  listJobs,
  getJob,
  cancelJob,
  createBatch,
  getBatch,
  createUpload,
  listMedia,
  getMedia,
  listPacks,
  getCredits,
  getOpenApiDocument,
};
