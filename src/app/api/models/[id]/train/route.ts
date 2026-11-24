import { parseBody, route } from "@/server/http";
import { toJobDTO } from "@/server/jobs/engine";
import { toModelView } from "@/server/models/service";
import { startTraining, trainModelBody } from "@/server/models/training";

/**
 * Start a model. `{ mode: "instant" }` → ready immediately, free (`job: null`).
 * `{ mode: "trained" }` → LoRA training job (40 credits, refunded on failure).
 */
export const POST = route<{ id: string }, "user">({ auth: "user" }, async ({ req, user, params }) => {
  const { mode } = await parseBody(req, trainModelBody);
  const { model, job } = await startTraining(user, params.id, mode);
  return { model: await toModelView(model, user.id), job: job ? await toJobDTO(job) : null };
});
