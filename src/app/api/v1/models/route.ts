import { v1Route } from "@/app/api/v1/_lib/handler";
import { listModelViews } from "@/server/models/detail";
import { v1Operations } from "@/server/openapi/operations";

/** Own identity models + models shared with the key's owner (flagged `shared`). */
export const GET = v1Route(v1Operations.listModels, async ({ user }) => ({ models: await listModelViews(user.id) }));
