import type { Metadata } from "next";
import Link from "next/link";
import { SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardOverview } from "@/components/app/dashboard-overview";
import { PageHeader } from "@/components/app/page-header";
import { APP } from "@/config/app";
import { t } from "@/i18n";
import { requireUserPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUserPage("/app");
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title={firstName ? t("dashboard.welcome", { name: firstName }) : t("dashboard.welcomeNew", { app: APP.name })}
        description={t("dashboard.subtitle")}
        actions={
          <Button asChild variant="brand" className="md:hidden">
            <Link href="/app/create">
              <SparklesIcon />
              {t("nav.create")}
            </Link>
          </Button>
        }
      />
      <DashboardOverview />
    </>
  );
}
