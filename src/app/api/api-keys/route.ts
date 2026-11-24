import { z } from "zod";
import { assertCanCreateApiKey, createApiKey, listApiKeys, toApiKeyDTO } from "@/server/auth/api-keys";
import { parseBody, route } from "@/server/http";

const createApiKeyRequest = z.object({ name: z.string().trim().min(1, "Give the key a name.").max(60) }).strict();

export const GET = route({ auth: "user" }, async ({ user }) => {
  const rows = await listApiKeys(user.id);
  return { apiKeys: rows.map(toApiKeyDTO) };
});

/** Returns the full key once (`key`); only its hash is stored. */
export const POST = route({ auth: "user" }, async ({ req, user }) => {
  const { name } = await parseBody(req, createApiKeyRequest);
  await assertCanCreateApiKey(user);
  const { key, row } = await createApiKey(user.id, name);
  return { key, apiKey: toApiKeyDTO(row) };
});
