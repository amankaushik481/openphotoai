import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { CreateStudio } from "@/components/create/create-studio";
import type { CreateMode } from "@/components/create/logic";
import { requireUserPage } from "@/server/auth/session";
import { listPackSummaries } from "@/server/packs/registry";
import { loadDraftAllowance, loadModelModes } from "./data";

export const metadata: Metadata = { title: "Create" };

const MODES: readonly CreateMode[] = ["prompt", "pack", "reference"];

function one(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
}

/** `/app/create?pack=<slug>&model=<id>&mode=prompt|pack|reference&prompt=...` deep links prefill the form. */
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUserPage("/app/create");
  const [params, packs, modelModes, drafts] = await Promise.all([
    searchParams,
    listPackSummaries(),
    loadModelModes(user.id),
    loadDraftAllowance(user),
  ]);

  const mode = one(params.mode);
  const modelId = one(params.model);
  const packId = one(params.pack);
  const prompt = one(params.prompt)?.slice(0, 1500);

  return (
    <>
      <PageHeader
        title="Create"
        description="Photos of you from a prompt, a photo pack or a reference image. Start with free drafts."
      />
      <CreateStudio
        packs={packs}
        modelModes={modelModes}
        drafts={{ limit: drafts.limit, remaining: drafts.remaining }}
        initial={{
          mode: MODES.find((m) => m === mode),
          modelId: modelId && Object.hasOwn(modelModes, modelId) ? modelId : undefined,
          packId: packId && packs.some((p) => p.slug === packId) ? packId : undefined,
          prompt,
        }}
      />
    </>
  );
}
