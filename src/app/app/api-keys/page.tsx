import type { Metadata } from "next";
import { ApiKeysManager } from "@/components/auth/api-keys-manager";
import { getPlan } from "@/config/plans";
import { MAX_ACTIVE_API_KEYS, listApiKeys, planHasApiAccess, toApiKeyDTO } from "@/server/auth/api-keys";
import { requireUserPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysPage() {
  const user = await requireUserPage("/app/api-keys");
  const keys = await listApiKeys(user.id);

  return (
    <ApiKeysManager
      initialKeys={keys.map(toApiKeyDTO)}
      apiAccess={planHasApiAccess(user)}
      planName={getPlan(user.plan).name}
      maxKeys={MAX_ACTIVE_API_KEYS}
    />
  );
}
