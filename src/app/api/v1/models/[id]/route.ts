import { v1Route } from "@/app/api/v1/_lib/handler";
import { parseQuery } from "@/server/http";
import { getModelDetail } from "@/server/models/detail";
import { v1Operations } from "@/server/openapi/operations";
import { v1GetModelQuery } from "@/server/openapi/queries";

/** Model + training photos + readiness (shared models: no photos), same as GET /api/models/:id. */
export const GET = v1Route<{ id: string }>(v1Operations.getModel, async ({ req, user, params }) => {
  const { mode } = parseQuery(req, v1GetModelQuery);
  return getModelDetail(user.id, params.id, mode);
});
