import { parseBody, route } from "@/server/http";
import { createModel, createModelBody } from "@/server/models/crud";
import { listModelViews } from "@/server/models/detail";
import { toModelView } from "@/server/models/service";

/** The user's identity models plus models shared with them (flagged `shared`, read-only). */
export const GET = route({ auth: "user_or_api" }, async ({ user }) => ({ models: await listModelViews(user.id) }));

/** Create a model (status awaiting_consent). Limited by the plan's maxModels. */
export const POST = route({ auth: "user" }, async ({ req, user }) => {
  const body = await parseBody(req, createModelBody);
  const model = await createModel(user, body);
  return { model: await toModelView(model, user.id) };
});
