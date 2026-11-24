import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AdminNav } from "@/components/layout/admin-nav";
import { DemoModeBanner } from "@/components/layout/demo-mode-banner";
import { Logo } from "@/components/layout/logo";
import { SkipLink } from "@/components/layout/skip-link";
import { UserMenu } from "@/components/layout/user-menu";
import { APP } from "@/config/app";
import { t } from "@/i18n";
import { env } from "@/lib/env";
import { requireAdminPage } from "@/server/auth/session";

export const metadata: Metadata = {
  title: { default: "Admin", template: `%s · Admin · ${APP.name}` },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdminPage();
  const shellUser = { name: user.name, email: user.email, image: user.image, isAdmin: true };

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <DemoModeBanner mocked={env.demoBanner ? env.mockedProviders : null} />
      <header className="glass sticky top-0 z-30 border-b border-border/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Logo href="/admin" showName={false} />
          <span className="font-display text-xl leading-none">{t("admin.title")}</span>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/app">
                <ArrowLeftIcon />
                <span className="sr-only sm:not-sr-only">{t("admin.backToApp")}</span>
              </Link>
            </Button>
            <UserMenu user={shellUser} />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6">
          <AdminNav />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
