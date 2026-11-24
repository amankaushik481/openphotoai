import type { Metadata } from "next";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { DemoModeBanner } from "@/components/layout/demo-mode-banner";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { SkipLink } from "@/components/layout/skip-link";
import { env } from "@/lib/env";
import { requireUserPage } from "@/server/auth/session";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUserPage("/app");
  const isAdmin = user.role === "admin";
  const shellUser = { name: user.name, email: user.email, image: user.image, isAdmin };

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15.5rem_minmax(0,1fr)]">
      <SkipLink />
      <AppSidebar isAdmin={isAdmin} className="hidden md:flex" />
      <div className="flex min-w-0 flex-col">
        <DemoModeBanner mocked={env.demoBanner ? env.mockedProviders : null} />
        <AppTopbar user={shellUser} />
        <main id="main" className="flex-1 px-4 pt-6 pb-28 sm:px-6 md:pb-12 lg:px-8 lg:pt-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
      <MobileBottomNav isAdmin={isAdmin} className="md:hidden" />
    </div>
  );
}
