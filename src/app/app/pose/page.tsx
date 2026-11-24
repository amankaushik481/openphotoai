import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { PoseStudio } from "@/components/edit/pose-studio";
import { requireUserPage } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Pose copy",
  description: "Upload any photo and get yourself in the same pose, framing, setting and lighting.",
};

export default async function PosePage() {
  await requireUserPage("/app/pose");
  return (
    <>
      <PageHeader
        eyebrow="Pose & style copy"
        title="Copy any pose"
        description="Upload a photo you love. We'll put you in the same pose, framing, setting and lighting."
      />
      <PoseStudio />
    </>
  );
}
