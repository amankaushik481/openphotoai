import type { Metadata } from "next";

import { TogetherStudio } from "@/components/together/together-studio";
import { requireUserPage } from "@/server/auth/session";
import { listInvites, listOwnModels, listPartnerModels, listTogetherPacks } from "@/server/together";

export const metadata: Metadata = { title: "Together photos" };

export default async function TogetherPage() {
  const user = await requireUserPage("/app/together");
  const [ownModels, partnerModels, invites, packs] = await Promise.all([
    listOwnModels(user.id),
    listPartnerModels(user.id),
    listInvites(user),
    listTogetherPacks(),
  ]);
  return <TogetherStudio ownModels={ownModels} partnerModels={partnerModels} invites={invites} packs={packs} />;
}
