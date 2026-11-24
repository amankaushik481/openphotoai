import { revokeApiKey } from "@/server/auth/api-keys";
import { errors, route } from "@/server/http";

export const DELETE = route<{ id: string }, "user">({ auth: "user" }, async ({ user, params }) => {
  const revoked = await revokeApiKey(user.id, params.id);
  if (!revoked) throw errors.notFound("API key");
  return { ok: true };
});
