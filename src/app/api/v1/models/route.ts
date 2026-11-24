import { toModelDTO } from "@/server/models/service";
import { v1Operations } from "@/server/openapi/operations";
import { v1Route } from "@/app/api/v1/_lib/handler";
import { listVisibleModels } from "@/app/api/v1/_lib/models";

/** Own identity models + models shared with the key's owner. */
export const GET = v1Route(v1Operations.listModels, async ({ user }) => {
  const rows = await listVisibleModels(user.id);
  return { models: await Promise.all(rows.map((m) => toModelDTO(m, user.id))) };
});
