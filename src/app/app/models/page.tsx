import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { ModelsList } from "@/components/models/models-list";
import { Button } from "@/components/ui/button";
import { requireUserPage } from "@/server/auth/session";
import { listModelViews } from "@/server/models/detail";

export const metadata: Metadata = { title: "My models" };

export default async function ModelsPage() {
  const user = await requireUserPage("/app/models");
  const models = await listModelViews(user.id);

  return (
    <>
      <PageHeader
        title="My models"
        description="Private AI models of you, created from a live consent selfie and your photos."
        actions={
          models.some((m) => !m.shared) ? (
            <Button asChild variant="brand">
              <Link href="/app/models/new">
                <PlusIcon />
                New model
              </Link>
            </Button>
          ) : undefined
        }
      />
      <ModelsList initialModels={models} />
    </>
  );
}
