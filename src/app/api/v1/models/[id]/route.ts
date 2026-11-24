import { toModelDTO } from "@/server/models/service";
import { v1Operations } from "@/server/openapi/operations";
import { v1Route } from "@/app/api/v1/_lib/handler";
import { getVisibleModel } from "@/app/api/v1/_lib/models";

export const GET = v1Route<{ id: string }>(v1Operations.getModel, async ({ user, params }) => {
  const model = await getVisibleModel(user.id, params.id);
  return { model: await toModelDTO(model, user.id) };
});
