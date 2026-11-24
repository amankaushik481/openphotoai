import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ModelDetail } from "@/components/models/model-detail";
import { requireUserPage } from "@/server/auth/session";
import { AppError } from "@/server/http";
import { getModelDetail } from "@/server/models/detail";

export const metadata: Metadata = { title: "Model" };

export default async function ModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserPage(`/app/models/${id}`);
  const detail = await getModelDetail(user.id, id).catch((err: unknown) => {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  });
  return <ModelDetail initial={detail} />;
}
