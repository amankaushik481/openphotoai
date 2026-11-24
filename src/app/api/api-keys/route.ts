import { z } from "zod";
import { API_KEY_SCOPES, assertCanCreateApiKey, createApiKey, listApiKeys, toApiKeyDTO } from "@/server/auth/api-keys";
import { parseBody, route } from "@/server/http";

const createApiKeyRequest = z
  .object({
    name: z.string().trim().min(1, "Give the key a name.").max(60),
    /** Default `["*"]` (full access). */
    scopes: z.array(z.enum(API_KEY_SCOPES)).min(1, "Pick at least one scope.").max(API_KEY_SCOPES.length).optional(),
  })
  .strict();

export const GET = route({ auth: "user" }, async ({ user }) => {
  const rows = await listApiKeys(user.id);
  return { apiKeys: rows.map(toApiKeyDTO) };
});

/** Returns the full key once (`key`); only its hash is stored. `scopes`: `*` | `read` | `generate`. */
export const POST = route({ auth: "user" }, async ({ req, user }) => {
  const { name, scopes } = await parseBody(req, createApiKeyRequest);
  await assertCanCreateApiKey(user);
  const { key, row } = await createApiKey(user.id, name, scopes);
  return { key, apiKey: toApiKeyDTO(row) };
});
