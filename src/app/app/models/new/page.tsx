import type { Metadata } from "next";

import { ModelWizard } from "@/components/models/model-wizard";
import { requireUserPage } from "@/server/auth/session";
import { AppError } from "@/server/http";
import { getModelDetail } from "@/server/models/detail";
import type { ModelDetailResponse } from "@/server/models/types";

export const metadata: Metadata = { title: "Create your model" };

/** `/app/models/new` starts a model; `?id=<modelId>` resumes one that is still being set up. */
export default async function NewModelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUserPage("/app/models/new");
  const raw = (await searchParams).id;
  const id = (Array.isArray(raw) ? raw[0] : raw)?.trim();

  let initial: ModelDetailResponse | null = null;
  if (id) {
    try {
      initial = await getModelDetail(user.id, id);
    } catch (err) {
      if (!(err instanceof AppError && err.code === "not_found")) throw err;
    }
    // Shared models can't be set up by someone else: start a fresh model instead.
    if (initial?.model.shared) initial = null;
  }

  return <ModelWizard key={initial?.model.id ?? "new"} initial={initial} />;
}
