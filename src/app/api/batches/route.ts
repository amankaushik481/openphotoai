import { parseBody, route } from "@/server/http";
import { toBatchDTO } from "@/server/jobs/batches";
import { createBatch } from "@/server/jobs/engine";
import { toJobDTOs } from "@/server/jobs/queries";
import { createBatchRequest } from "@/types/domain";

/**
 * One pack -> many images. If credits run out part-way, the batch is shrunk to the jobs that were
 * created and the response says so (`requested` vs `batch.total`, `stoppedReason`).
 */
export const POST = route({ auth: "user" }, async ({ req, user, apiKey }) => {
  const body = await parseBody(req, createBatchRequest);
  const result = await createBatch(user, body, { apiKeyId: apiKey?.id ?? null });
  return {
    batch: toBatchDTO(result.batch),
    jobs: await toJobDTOs(result.jobs),
    requested: result.requested,
    stoppedReason: result.stoppedReason ?? null,
  };
});
