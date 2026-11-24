import { parseBody } from "@/server/http";
import { toBatchDTO } from "@/server/jobs/batches";
import { createBatch } from "@/server/jobs/engine";
import { toJobDTOs } from "@/server/jobs/queries";
import { v1Operations } from "@/server/openapi/operations";
import { createBatchRequest } from "@/types/domain";
import { v1Route } from "@/app/api/v1/_lib/handler";

/** One pack -> many images. Shrinks to the jobs created if credits run out part-way. */
export const POST = v1Route(v1Operations.createBatch, async ({ req, user, apiKey }) => {
  const body = await parseBody(req, createBatchRequest);
  const result = await createBatch(user, body, { apiKeyId: apiKey.id });
  return {
    batch: toBatchDTO(result.batch),
    jobs: await toJobDTOs(result.jobs),
    requested: result.requested,
    stoppedReason: result.stoppedReason ?? null,
  };
});
