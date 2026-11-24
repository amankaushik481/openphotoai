import { getOwnedMedia, toMediaDTO } from "@/server/media/service";
import { v1Operations } from "@/server/openapi/operations";
import { v1Route } from "@/app/api/v1/_lib/handler";

export const GET = v1Route<{ id: string }>(v1Operations.getMedia, async ({ user, params }) => {
  const row = await getOwnedMedia(user.id, params.id);
  return { media: await toMediaDTO(row) };
});
